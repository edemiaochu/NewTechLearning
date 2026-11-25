const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cheerio = require('cheerio');
const { fetchText } = require('./net');

const ECDICT_FILE = path.join(__dirname, '..', 'data', 'ecdict.json.gz');
const MAX_ENTRIES = 600;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_POS = 3;
const MAX_SENSES = 3;
const MIN_INTERVAL_MS = 350;

const CAMBRIDGE = {
  english: 'https://dictionary.cambridge.org/dictionary/english/',
  chinese: 'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/',
};
const FREE_DICTIONARY = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/ /g, ' ')
    .trim();
}

/** Only accept single English words (letters plus internal ' or -). */
function normalizeWord(raw) {
  let word = String(raw || '').trim().toLowerCase();
  word = word.replace(/[’‘]/g, "'");
  word = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
  if (!/^[a-z][a-z'-]{0,38}$/.test(word)) return null;
  if (!/[a-z]/.test(word)) return null;
  return word;
}

function uniquePush(list, value) {
  if (value && !list.includes(value)) list.push(value);
  return list;
}

function parseCambridge(html, lang) {
  const $ = cheerio.load(html);
  if (!$('.entry-body__el').length) return null;

  const headword = cleanText($('.hw').first().text());
  const phonetics = [];
  $('.pron .ipa, .ipa').each((_, el) => {
    uniquePush(phonetics, cleanText($(el).text()));
    if (phonetics.length >= 2) return false;
    return undefined;
  });

  const entries = [];
  $('.entry-body__el').each((_, el) => {
    if (entries.length >= MAX_POS) return false;
    const $entry = $(el);
    const pos = cleanText($entry.find('.pos').first().text()).slice(0, 32);
    const senses = [];

    $entry.find('.def-block').each((__, defEl) => {
      if (senses.length >= MAX_SENSES) return false;
      const $def = $(defEl);
      const def = cleanText($def.find('.def').first().text());
      if (!def) return undefined;
      const trans = cleanText($def.find('.trans').first().text());
      const $example = $def.find('.examp').first();
      const example = cleanText($example.find('.eg').first().text());
      const exampleTrans = cleanText($example.find('.trans').first().text());
      senses.push({
        def,
        trans: lang === 'chinese' ? trans : '',
        example,
        exampleTrans,
      });
      return undefined;
    });

    if (senses.length) entries.push({ pos, senses });
    return undefined;
  });

  if (!entries.length) return null;
  return { word: headword, phonetics, entries };
}

let ecdictPromise = null;

/** Lazily load the compact MIT-licensed ECDICT subset bundled with the app. */
function loadEcdict() {
  if (!ecdictPromise) {
    ecdictPromise = fs.promises
      .readFile(ECDICT_FILE)
      .then((buffer) => JSON.parse(zlib.gunzipSync(buffer).toString('utf8')))
      .catch(() => null);
  }
  return ecdictPromise;
}

async function lookupEcdict(word) {
  const data = await loadEcdict();
  if (!data?.words) return null;
  let key = word;
  let lemma = '';
  if (!data.words[key] && data.forms?.[key]) {
    lemma = data.forms[key];
    key = lemma;
  }
  const row = data.words[key];
  if (!Array.isArray(row)) return null;
  return {
    word: key,
    lemma: lemma && lemma !== word ? word : '',
    phonetic: String(row[0] || ''),
    translation: String(row[1] || ''),
    pos: String(row[2] || ''),
    exchange: String(row[3] || ''),
    collins: Number(row[4]) || 0,
    oxford: Number(row[5]) || 0,
    tag: String(row[6] || ''),
  };
}

function ecdictChinese(entry) {
  const lines = String(entry?.translation || '')
    .split('\\n')
    .map(cleanText)
    .filter(Boolean)
    .slice(0, 8);
  if (!lines.length) return [];
  return [
    {
      pos: '',
      senses: lines.map((line) => ({
        def: '',
        trans: line,
        example: '',
        exampleTrans: '',
      })),
    },
  ];
}

function parseFreeDictionary(payload, fallbackWord) {
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(data) || !data.length) return null;

  const phonetics = [];
  const entries = [];
  for (const item of data) {
    if (entries.length >= MAX_POS) break;
    if (item?.phonetic) uniquePush(phonetics, cleanText(item.phonetic));
    if (Array.isArray(item?.phonetics)) {
      for (const p of item.phonetics) {
        uniquePush(phonetics, cleanText(p?.text));
        if (phonetics.length >= 2) break;
      }
    }
    if (!Array.isArray(item?.meanings)) continue;
    for (const meaning of item.meanings) {
      if (entries.length >= MAX_POS) break;
      const senses = [];
      for (const definition of meaning?.definitions || []) {
        if (senses.length >= MAX_SENSES) break;
        const def = cleanText(definition?.definition);
        if (!def) continue;
        senses.push({
          def,
          trans: '',
          example: cleanText(definition?.example),
          exampleTrans: '',
        });
      }
      if (senses.length) {
        entries.push({ pos: cleanText(meaning?.partOfSpeech).slice(0, 32), senses });
      }
    }
  }
  if (!entries.length) return null;
  return {
    word: cleanText(data[0]?.word) || fallbackWord,
    phonetics,
    entries,
  };
}

class DictionaryStore {
  constructor({ file }) {
    this.file = file;
    this.entries = {};
    this.inflight = new Map();
    this.writeChain = Promise.resolve();
    this.lastRequestAt = 0;
  }

  async init() {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' ? parsed.entries || parsed : {};
      for (const [word, entry] of Object.entries(entries)) {
        if (!entry || !entry.data) continue;
        this.entries[word] = entry;
      }
    } catch {
      // First run / unreadable cache: start empty.
    }
    this.prune();
    return { entries: Object.keys(this.entries).length };
  }

  prune() {
    const now = Date.now();
    for (const [word, entry] of Object.entries(this.entries)) {
      if (!entry?.at || now - entry.at > CACHE_TTL_MS) delete this.entries[word];
    }
    const words = Object.keys(this.entries);
    if (words.length > MAX_ENTRIES) {
      words
        .sort((a, b) => (this.entries[a].at || 0) - (this.entries[b].at || 0))
        .slice(0, words.length - MAX_ENTRIES)
        .forEach((word) => delete this.entries[word]);
    }
  }

  get(word) {
    const entry = this.entries[word];
    if (!entry?.data) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      delete this.entries[word];
      return null;
    }
    return { ...entry.data, fromCache: true };
  }

  async put(word, data) {
    this.entries[word] = { at: Date.now(), data };
    this.prune();
    await this.save();
  }

  async save() {
    const payload = JSON.stringify({ version: 1, entries: this.entries });
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(() => fs.promises.writeFile(this.file, payload, 'utf8'))
      .catch(() => {});
    await this.writeChain;
  }

  async clear() {
    this.entries = {};
    try {
      await fs.promises.rm(this.file, { force: true });
    } catch {
      // Ignore.
    }
    return { entries: 0 };
  }

  async throttle() {
    const wait = MIN_INTERVAL_MS - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  async loadCambridge(word, lang) {
    const url = CAMBRIDGE[lang] + encodeURIComponent(word);
    try {
      await this.throttle();
      const res = await fetchText(url, {
        route: 'auto',
        timeout: 12000,
        retries: 1,
        headers: { 'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8' },
      });
      const parsed = parseCambridge(res.text, lang);
      if (!parsed) return { ok: false, url, reason: 'empty' };
      return { ok: true, url: res.url || url, ...parsed };
    } catch (err) {
      return {
        ok: false,
        url,
        reason: err?.status === 404 ? 'notfound' : 'fetch',
        status: err?.status || 0,
      };
    }
  }

  async loadFreeEnglish(word) {
    const url = FREE_DICTIONARY + encodeURIComponent(word);
    try {
      await this.throttle();
      const res = await fetchText(url, {
        route: 'auto',
        timeout: 12000,
        retries: 1,
        accept: 'application/json',
      });
      const parsed = parseFreeDictionary(res.text, word);
      if (!parsed) return null;
      return { ok: true, url: res.url || url, ...parsed };
    } catch {
      return null;
    }
  }

  async lookup(rawWord, options = {}) {
    const word = normalizeWord(rawWord);
    if (!word) {
      return {
        ok: false,
        code: 'invalid',
        message: '请只选择一个英文单词（字母、连字符或撇号）。',
      };
    }

    if (!options.force) {
      const cached = this.get(word);
      if (cached) return cached;
    }
    if (this.inflight.has(word)) return this.inflight.get(word);

    const promise = (async () => {
      const [englishResult, chineseResult, offline] = await Promise.all([
        this.loadCambridge(word, 'english'),
        this.loadCambridge(word, 'chinese'),
        lookupEcdict(word),
      ]);

      let english = englishResult?.ok ? englishResult : null;
      let englishSource = english ? 'cambridge' : '';
      let englishUrl = english?.url || '';

      // Cambridge English can be blocked or return an empty shell; keep a
      // free Wiktionary fallback so English definitions still work.
      if (!english) {
        const fallback = await this.loadFreeEnglish(word);
        if (fallback?.ok) {
          english = fallback;
          englishSource = 'wiktionary';
          englishUrl = fallback.url;
        }
      }

      const cambridgeChinese = chineseResult?.ok ? chineseResult : null;
      let chineseEntries = cambridgeChinese?.entries || [];
      let chineseSource = chineseEntries.length ? 'cambridge' : '';
      if (!chineseEntries.length && offline) {
        chineseEntries = ecdictChinese(offline);
        if (chineseEntries.length) chineseSource = 'ecdict';
      }

      // Only flag this when Cambridge failed for network reasons; a plain
      // "word not in Cambridge" result is a legitimate ECDICT-only hit.
      const networkFailed =
        englishResult?.reason === 'fetch' || chineseResult?.reason === 'fetch';
      const offlineOnly = Boolean(
        offline && !english && !cambridgeChinese && networkFailed
      );

      const phonetics = [];
      for (const value of english?.phonetics || []) uniquePush(phonetics, value);
      for (const value of cambridgeChinese?.phonetics || []) uniquePush(phonetics, value);
      if (!phonetics.length && offline?.phonetic) uniquePush(phonetics, offline.phonetic);

      const found = Boolean(english || chineseEntries.length || offline);
      if (!found) {
        return {
          ok: false,
          code: 'notfound',
          word,
          message: 'Cambridge 与离线 ECDICT 都没有找到这个词，或当前网络无法访问。',
          sourceUrl:
            englishUrl || chineseResult?.url || CAMBRIDGE.english + encodeURIComponent(word),
        };
      }

      const sources = [];
      if (englishSource === 'cambridge') sources.push('Cambridge Dictionary');
      if (englishSource === 'wiktionary') sources.push('Wiktionary');
      if (chineseSource === 'cambridge') sources.push('Cambridge 英汉');
      if (chineseSource === 'ecdict') sources.push('ECDICT');

      const data = {
        ok: true,
        word,
        headword: english?.word || cambridgeChinese?.word || offline?.word || word,
        phonetics: phonetics.slice(0, 2),
        english: english?.entries || [],
        chinese: chineseEntries,
        englishSource,
        chineseSource,
        englishUrl,
        chineseUrl: cambridgeChinese?.url || '',
        ecdict: offline,
        offlineOnly,
        source: [...new Set(sources)].join(' + '),
        fetchedAt: new Date().toISOString(),
      };
      // Do not persist an ECDICT-only result when Cambridge was unreachable:
      // the caller should be able to retry once the network is back.
      if (english || chineseSource === 'cambridge') await this.put(word, data);
      return data;
    })().finally(() => this.inflight.delete(word));

    this.inflight.set(word, promise);
    return promise;
  }
}

module.exports = {
  DictionaryStore,
  normalizeWord,
  parseCambridge,
  parseFreeDictionary,
};

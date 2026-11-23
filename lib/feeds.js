const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const { SOURCES, SOURCE_MAP } = require('./sources');
const { fetchText } = require('./net');

const MAX_ITEMS_BY_SOURCE = {
  claude: 20,
  openai: 20,
  deepmind: 20,
  googleai: 20,
  arxiv: 12,
  hn: 18,
  mittr: 12,
  verge: 12,
};
const DEFAULT_MAX_ITEMS = 20;
const STALE_AFTER_MS = 30 * 60 * 1000;

function maxItemsFor(sourceId) {
  return MAX_ITEMS_BY_SOURCE[sourceId] || DEFAULT_MAX_ITEMS;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: '__cdata',
  isArray: (name) => ['item', 'entry', 'link', 'category'].includes(name),
});

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(input) {
  return String(input)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function htmlToText(html) {
  if (!html) return '';
  let s = String(html);
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|blockquote|section)>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '• ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function textOf(value) {
  if (value == null) return '';
  if (typeof value === 'string') return decodeEntities(value).trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    for (const entry of value) {
      const t = textOf(entry);
      if (t) return t;
    }
    return '';
  }
  if (typeof value === 'object') {
    if (value.__cdata) return String(value.__cdata).trim();
    if (value['#text'] != null) return String(value['#text']).trim();
    if (value['@_href']) return String(value['@_href']).trim();
  }
  return '';
}

function linkOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return decodeEntities(value).trim();
  if (Array.isArray(value)) {
    const alternate =
      value.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') || value[0];
    return linkOf(alternate);
  }
  if (typeof value === 'object') {
    return textOf(value['@_href'] || value['#text'] || value);
  }
  return '';
}

function categoriesOf(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : [value];
  const out = [];
  for (const entry of list) {
    const label =
      typeof entry === 'string'
        ? entry
        : textOf(entry?.['@_term'] || entry?.['#text'] || entry);
    const clean = htmlToText(label).replace(/\s+/g, ' ').trim();
    if (clean && clean.length <= 40 && !out.includes(clean)) out.push(clean);
    if (out.length >= 4) break;
  }
  return out;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function shortHash(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex').slice(0, 16);
}

function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const atSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (atSentence > max * 0.55) return cut.slice(0, atSentence + 1).trim();
  const atSpace = cut.lastIndexOf(' ');
  return (atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).trim() + '…';
}

function stripArxivPrefix(text) {
  if (!text) return '';
  const idx = text.search(/\bAbstract:\s*/i);
  if (idx >= 0) return text.slice(idx).replace(/^Abstract:\s*/i, '').trim();
  return text.replace(/^arXiv:\S+\s+Announce Type:\s*\S+\s*/i, '').trim();
}

function hnMeta(html) {
  const raw = htmlToText(html);
  const points = raw.match(/Points:\s*(\d+)/i)?.[1] || '';
  const comments = raw.match(/#\s*Comments:\s*(\d+)/i)?.[1] || '';
  const link = raw.match(/Article URL:\s*(\S+)/i)?.[1] || '';
  return { points, comments, link };
}

function cleanSummary(sourceId, rawHtml) {
  let text = htmlToText(rawHtml);
  if (!text) return '';
  if (sourceId === 'hn') {
    const meta = hnMeta(rawHtml);
    text = text
      .split('\n')
      .filter((line) => !/^(Article URL|Comments URL|Points|# Comments)\s*:/i.test(line.trim()))
      .join('\n')
      .trim();
    if (!text) {
      return meta.points
        ? `HN 热度 ${meta.points} 分${meta.comments ? ` · ${meta.comments} 条讨论` : ''}`
        : '';
    }
  }
  if (sourceId === 'arxiv') text = stripArxivPrefix(text);
  return truncate(text, 320);
}

function normalizeItem(sourceId, raw, feedTitle) {
  const title = htmlToText(textOf(raw.title)).replace(/\s+/g, ' ').trim();
  const link = linkOf(raw.link) || textOf(raw.guid) || textOf(raw.id);
  if (!link || !/^https?:\/\//i.test(link)) return null;

  const rawDescription = textOf(
    raw['content:encoded'] ||
      raw.content ||
      raw.description ||
      raw.summary ||
      raw['media:description'] ||
      ''
  );
  const summary = cleanSummary(sourceId, rawDescription);

  const author =
    htmlToText(textOf(raw['dc:creator'])).trim() ||
    htmlToText(textOf(raw.author?.name || raw.author)).trim() ||
    (sourceId === 'arxiv' ? feedTitle : '');

  const publishedAt =
    toIso(raw.pubDate || raw.published || raw.updated || raw['dc:date']) || null;

  const meta = {};
  if (sourceId === 'hn') {
    const m = hnMeta(rawDescription);
    if (m.points) meta.points = Number(m.points) || m.points;
    if (m.comments) meta.comments = Number(m.comments) || m.comments;
  }
  if (sourceId === 'arxiv') {
    const idMatch = String(raw.id || link).match(/arxiv\.org\/abs\/([^/?#]+)/i);
    if (idMatch) meta.arxivId = idMatch[1];
    const subj = String(raw['arxiv:primary_category']?.['@_term'] || '').trim();
    if (subj) meta.primaryCategory = subj;
  }

  let finalSummary = summary;
  if (sourceId === 'hn' && (!finalSummary || /^HN 热度/.test(finalSummary))) {
    let host = '';
    try {
      host = new URL(link).hostname.replace(/^www\./, '');
    } catch {
      host = '';
    }
    const heat = meta.points
      ? `HN 热度 ${meta.points} 分${meta.comments != null ? ` · ${meta.comments} 条讨论` : ''}`
      : '';
    finalSummary = `${host ? `来自 ${host} 的社区分享。` : '来自 Hacker News 的社区分享。'}${
      heat ? ` ${heat}。` : ''
    }`;
  }

  return {
    id: shortHash(`${sourceId}:${link}`),
    sourceId,
    title: title || '（无标题）',
    link,
    publishedAt,
    author: author || '',
    summary: finalSummary || '打开原文查看完整内容。',
    tags: categoriesOf(raw.category),
    meta,
  };
}

function parseFeed(xml, source) {
  const doc = parser.parse(xml);
  const rss = doc.rss || doc['rdf:RDF'] || null;
  const atom = doc.feed || null;
  const channel = rss?.channel || null;
  const feedTitle = textOf(channel?.title || atom?.title) || source.title;

  let rawItems = [];
  if (channel?.item) rawItems = Array.isArray(channel.item) ? channel.item : [channel.item];
  else if (rss?.item) rawItems = Array.isArray(rss.item) ? rss.item : [rss.item];
  else if (atom?.entry) rawItems = Array.isArray(atom.entry) ? atom.entry : [atom.entry];

  const items = [];
  const seen = new Set();
  for (const raw of rawItems) {
    const item = normalizeItem(source.id, raw, feedTitle);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }

  items.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });

  return { feedTitle, items: items.slice(0, maxItemsFor(source.id)) };
}

function mergeItems(oldItems, newItems, limit) {
  const map = new Map();
  for (const item of newItems || []) map.set(item.id, item);
  for (const item of oldItems || []) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()]
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

class FeedService {
  constructor({ cacheFile, routeForSource = () => 'proxy' }) {
    this.cacheFile = cacheFile;
    this.routeForSource = routeForSource;
    this.sources = SOURCES;
    this.cache = { updatedAt: null, sources: {} };
    for (const s of SOURCES) {
      this.cache.sources[s.id] = { items: [], fetchedAt: null, checkedAt: null, error: null };
    }
    this.inflight = null;
  }

  async init() {
    try {
      const raw = await fs.promises.readFile(this.cacheFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.sources) {
        this.cache.updatedAt = parsed.updatedAt || null;
        for (const source of SOURCES) {
          const entry = parsed.sources[source.id];
          if (entry && Array.isArray(entry.items)) {
            this.cache.sources[source.id] = {
              items: entry.items,
              fetchedAt: entry.fetchedAt || null,
              checkedAt: entry.checkedAt || null,
              error: entry.error || null,
              etag: entry.etag || '',
              lastModified: entry.lastModified || '',
            };
          }
        }
      }
    } catch {
      // First run or unreadable cache: start empty.
    }
    return this.snapshot();
  }

  async save() {
    try {
      await fs.promises.mkdir(path.dirname(this.cacheFile), { recursive: true });
      const data = JSON.stringify(this.cache, null, 2);
      const tmp = `${this.cacheFile}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, data, 'utf8');
      await fs.promises.rename(tmp, this.cacheFile);
    } catch (err) {
      console.error('[feeds] failed to persist cache:', err.message);
    }
  }

  getSourceMeta() {
    return SOURCES;
  }

  snapshot() {
    return {
      updatedAt: this.cache.updatedAt,
      stale: this.cache.updatedAt
        ? Date.now() - Date.parse(this.cache.updatedAt) > STALE_AFTER_MS
        : true,
      sources: this.cache.sources,
    };
  }

  async clear() {
    this.cache = { updatedAt: null, sources: {} };
    for (const s of SOURCES) {
      this.cache.sources[s.id] = { items: [], fetchedAt: null, checkedAt: null, error: null };
    }
    try {
      await fs.promises.rm(this.cacheFile, { force: true });
    } catch {
      // Ignore.
    }
    return this.snapshot();
  }

  async refreshAll({ force = false } = {}) {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const results = await Promise.allSettled(
        SOURCES.map((source) => this.refreshSource(source.id, { force }))
      );
      let succeeded = 0;
      const errors = [];
      results.forEach((result, i) => {
        if (result.status === 'fulfilled' && !result.value?.error) succeeded += 1;
        else {
          const source = SOURCES[i];
          errors.push({
            sourceId: source.id,
            message:
              result.status === 'rejected'
                ? result.reason?.message || '未知错误'
                : result.value?.error || '未知错误',
          });
        }
      });
      // Do not mark the cache as fresh when every source failed; otherwise
      // the next launch would consider the empty cache up-to-date and skip
      // the automatic retry.
      if (succeeded > 0) this.cache.updatedAt = new Date().toISOString();
      await this.save();
      this.inflight = null;
      return {
        ...this.snapshot(),
        report: { succeeded, total: SOURCES.length, errors },
      };
    })();
    return this.inflight;
  }

  async refreshSource(sourceId, { force = false } = {}) {
    const source = SOURCE_MAP[sourceId];
    if (!source) throw new Error(`Unknown source: ${sourceId}`);
    const entry = this.cache.sources[sourceId];
    const headers = {};
    if (!force) {
      if (entry.etag) headers['If-None-Match'] = entry.etag;
      if (entry.lastModified) headers['If-Modified-Since'] = entry.lastModified;
    }

    const now = new Date().toISOString();
    try {
      const route = this.routeForSource(sourceId) === 'direct' ? 'direct' : 'proxy';
      const res = await fetchText(source.feedUrl, {
        timeout: 14000,
        retries: 2,
        headers,
        route,
        accept: 'application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
      });

      if (res.notModified) {
        entry.checkedAt = now;
        entry.fetchedAt = now;
        entry.error = null;
        return { sourceId, notModified: true, count: entry.items.length };
      }

      const parsed = parseFeed(res.text, source);
      entry.items = mergeItems(entry.items, parsed.items, maxItemsFor(sourceId));
      entry.fetchedAt = now;
      entry.checkedAt = now;
      entry.error = null;
      entry.etag = res.etag || '';
      entry.lastModified = res.lastModified || '';
      return {
        sourceId,
        count: entry.items.length,
        fresh: parsed.items.length,
        feedTitle: parsed.feedTitle,
      };
    } catch (err) {
      entry.checkedAt = now;
      entry.error = err.message || '抓取失败';
      return { sourceId, error: entry.error, count: entry.items.length };
    }
  }
}

module.exports = { FeedService, htmlToText, parseFeed, STALE_AFTER_MS };

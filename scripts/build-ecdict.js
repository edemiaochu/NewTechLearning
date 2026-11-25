#!/usr/bin/env node
/**
 * Build the trimmed offline EN-ZH dictionary used by lib/dictionary.js.
 *
 * Input:  ECDICT ecdict.csv  (https://github.com/skywind3000/ECDICT, MIT)
 * Output: data/ecdict.json.gz
 *
 * Only words that are tagged (CET/GRE/…), in Collins/Oxford lists, or inside
 * the top 100k frequency ranks are kept. Inflected forms referenced by the
 * `exchange` column are added as a form→lemma lookup table.
 *
 * Usage:
 *   node scripts/build-ecdict.js path/to/ecdict.csv [data/ecdict.json.gz]
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');

const input = process.argv[2];
const output = process.argv[3] || path.join(__dirname, '..', 'data', 'ecdict.json.gz');
if (!input) {
  console.error('Usage: node scripts/build-ecdict.js <ecdict.csv> [out.json.gz]');
  process.exit(1);
}

/** Minimal RFC4180 parser for one line (ECDICT has no embedded newlines). */
function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function rankOf(row) {
  const ranks = [];
  for (const key of ['frq', 'bnc']) {
    const value = Number(row[key]);
    if (Number.isFinite(value) && value > 0) ranks.push(value);
  }
  return ranks.length ? Math.min(...ranks) : Infinity;
}

function metaScore(row) {
  return (
    (Number(row.oxford) ? 10 : 0) +
    (Number(row.collins) || 0) +
    String(row.tag || '')
      .split(/\s+/)
      .filter(Boolean).length +
    (row.translation ? 1 : 0)
  );
}

async function main() {
  const words = new Map();
  const forms = new Map();
  let total = 0;
  let kept = 0;
  let header = null;

  const rl = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line) continue;
    const cells = parseCsvLine(line);
    if (!header) {
      header = cells;
      continue;
    }
    total += 1;
    if (cells.length < header.length) continue;
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? '';
    });
    const word = String(row.word || '').trim();
    if (!word) continue;
    const common =
      Number(row.collins) > 0 ||
      Number(row.oxford) > 0 ||
      Boolean(String(row.tag || '').trim()) ||
      rankOf(row) <= 100000;
    if (!common) continue;

    const key = word.toLowerCase();
    const entry = [
      String(row.phonetic || '').trim(),
      String(row.translation || '').trim(),
      String(row.pos || '').trim(),
      String(row.exchange || '').trim(),
      Number(row.collins) || 0,
      Number(row.oxford) ? 1 : 0,
      String(row.tag || '').trim(),
    ];
    const existing = words.get(key);
    if (!existing) {
      words.set(key, entry);
      kept += 1;
    } else if (metaScore(row) > existing.__score) {
      words.set(key, entry);
    }
    entry.__score = metaScore(row);
  }

  // ECDICT exchange codes: p past / d past participle / i -ing / 3 3rd person /
  // r comparative / t superlative / s plural. Codes 0 and 1 describe the lemma
  // relationship and must not be used as inflected forms.
  const FORM_CODES = new Set(['p', 'd', 'i', '3', 'r', 't', 's']);
  for (const [word, entry] of words) {
    delete entry.__score;
    for (const part of entry[3].split('/')) {
      const colon = part.indexOf(':');
      if (colon === -1) continue;
      const code = part.slice(0, colon).trim();
      if (!FORM_CODES.has(code)) continue;
      const form = part.slice(colon + 1).trim().toLowerCase();
      if (!form || form === word) continue;
      if (!/^[a-z][a-z'-]*$/.test(form)) continue;
      if (!forms.has(form)) forms.set(form, word);
    }
  }

  const sortedWords = {};
  for (const key of [...words.keys()].sort()) sortedWords[key] = words.get(key);
  const sortedForms = {};
  for (const key of [...forms.keys()].sort()) sortedForms[key] = forms.get(key);

  const payload = {
    v: 1,
    source: 'ECDICT',
    license: 'MIT',
    words: sortedWords,
    forms: sortedForms,
  };
  const raw = Buffer.from(JSON.stringify(payload));
  const gz = zlib.gzipSync(raw, { level: 9 });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, gz);
  console.log(
    `[ecdict] rows=${total} kept=${Object.keys(sortedWords).length} forms=${
      Object.keys(sortedForms).length
    } raw=${(raw.length / 1048576).toFixed(1)}MiB gzip=${(gz.length / 1048576).toFixed(
      1
    )}MiB -> ${output}`
  );
}

main().catch((err) => {
  console.error('[ecdict] build failed:', err);
  process.exit(1);
});

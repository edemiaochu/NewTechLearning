const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 60;
const MAX_TEXT_CHARS = 80000;

class ArticleStore {
  constructor({ file }) {
    this.file = file;
    this.entries = {};
    this.inflight = new Map();
    this.writeChain = Promise.resolve();
  }

  async init() {
    try {
      const raw = await fs.promises.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      const entries = parsed && typeof parsed === 'object' ? parsed.entries || parsed : null;
      if (entries && typeof entries === 'object') {
        for (const [id, entry] of Object.entries(entries)) {
          if (!entry || !Array.isArray(entry.blocks) || !entry.blocks.length) continue;
          this.entries[id] = entry;
        }
      }
    } catch {
      // First run / unreadable cache: start empty.
    }
    this.prune();
    return this.snapshot();
  }

  snapshot() {
    return { entries: Object.keys(this.entries).length };
  }

  get(item) {
    if (!item?.id) return null;
    const entry = this.entries[item.id];
    if (!entry || !Array.isArray(entry.blocks) || !entry.blocks.length) return null;
    return { ...entry, ok: true, fromCache: true };
  }

  async put(item, article) {
    if (!item?.id || !article || !article.ok) return article;
    const entry = {
      ...article,
      ok: true,
      id: item.id,
      sourceId: item.sourceId || article.sourceId || '',
      link: item.link || article.url || '',
      text: String(article.text || '').slice(0, MAX_TEXT_CHARS),
      cachedAt: new Date().toISOString(),
    };
    delete entry.fromCache;
    this.entries[item.id] = entry;
    this.prune();
    await this.save();
    return entry;
  }

  async load(item, loader) {
    const cached = this.get(item);
    if (cached) return cached;
    if (this.inflight.has(item.id)) return this.inflight.get(item.id);
    const promise = (async () => {
      const article = await loader(item);
      await this.put(item, article);
      return article;
    })().finally(() => this.inflight.delete(item.id));
    this.inflight.set(item.id, promise);
    return promise;
  }

  async clear() {
    this.entries = {};
    try {
      await fs.promises.rm(this.file, { force: true });
    } catch {
      // Ignore.
    }
    return this.snapshot();
  }

  prune() {
    const entries = Object.entries(this.entries)
      .filter(([, entry]) => entry && Array.isArray(entry.blocks) && entry.blocks.length)
      .sort(
        (a, b) =>
          (Date.parse(b[1].cachedAt || b[1].fetchedAt || 0) || 0) -
          (Date.parse(a[1].cachedAt || a[1].fetchedAt || 0) || 0)
      )
      .slice(0, MAX_ENTRIES);
    this.entries = Object.fromEntries(entries);
  }

  save() {
    const data = JSON.stringify({ version: 1, entries: this.entries });
    this.writeChain = this.writeChain
      .catch(() => {})
      .then(async () => {
        try {
          await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
          const tmp = `${this.file}.${process.pid}.tmp`;
          await fs.promises.writeFile(tmp, data, 'utf8');
          await fs.promises.rename(tmp, this.file);
        } catch (err) {
          console.error('[articles] failed to persist cache:', err.message);
        }
      });
    return this.writeChain;
  }
}

module.exports = { ArticleStore, MAX_ENTRIES };

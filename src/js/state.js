/* Renderer state, local persistence and derived selectors. */

const LS = {
  theme: 'fr.theme',
  read: 'fr.read',
  saved: 'fr.saved',
  notes: 'fr.notes',
  ai: 'fr.ai',
  view: 'fr.view',
  order: 'fr.order',
  readerLayout: 'fr.readerLayout',
  splitWidth: 'fr.splitWidth',
  readerWidth: 'fr.readerWidth',
  readerHeight: 'fr.readerHeight',
  readerFontSize: 'fr.readerFontSize',
  readerColumnWidth: 'fr.readerColumnWidth',
  ink: 'fr.ink',
};

const THEMES = ['aurora', 'ocean', 'forest', 'ember', 'violet', 'light'];
const MAX_READ = 1500;
const MAX_SAVED = 600;
const MAX_AI = 30;

export const state = {
  sources: [],
  feeds: {},
  updatedAt: null,
  stale: true,
  view: 'overview',
  sourceFilter: 'all',
  unreadOnly: false,
  order: 'mixed',
  query: '',
  theme: 'aurora',
  read: new Set(),
  saved: new Set(),
  notes: {},
  ai: {},
  ink: {},
  settings: {
    hasApiKey: false,
    keyHint: '',
    autoRefresh: true,
    secure: true,
    model: 'claude-opus-5-5',
    aiProvider: 'local-claude',
    aiModel: 'claude-opus-5-5',
    aiBaseUrl: '',
    localConfig: null,
    proxyMode: 'system',
    proxyUrl: '',
    proxyStatus: null,
    directSources: [],
  },
  appInfo: { version: '1.0.0', dataPath: '' },
  ui: {
    booted: false,
    refreshing: false,
    refreshError: null,
    lastReport: null,
    activeItem: null,
    article: null,
    articleLoading: false,
    articleError: null,
    aiLoading: false,
    aiError: null,
    modal: null,
    themeOpen: false,
    settingsNotice: null,
    noteSaving: false,
    readerLayout: 'center',
    splitWidth: 540,
    readerWidth: 800,
    readerHeight: 0,
    readerFontSize: 17,
    readerColumnWidth: 760,
    fontOpen: false,
    penActive: false,
    penColor: 'primary',
    penWidth: 4,
    penEraser: false,
  },
};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the app keeps working in memory.
  }
}

export function hydrateLocal() {
  state.theme = THEMES.includes(localStorage.getItem(LS.theme))
    ? localStorage.getItem(LS.theme)
    : 'aurora';
  document.documentElement.dataset.theme = state.theme;

  const read = readJSON(LS.read, []);
  state.read = new Set(Array.isArray(read) ? read.slice(-MAX_READ) : []);

  const saved = readJSON(LS.saved, []);
  state.saved = new Set(Array.isArray(saved) ? saved.slice(-MAX_SAVED) : []);

  const notes = readJSON(LS.notes, {});
  state.notes = notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {};

  const ai = readJSON(LS.ai, {});
  state.ai = ai && typeof ai === 'object' && !Array.isArray(ai) ? ai : {};

  const ink = readJSON(LS.ink, {});
  state.ink = ink && typeof ink === 'object' && !Array.isArray(ink) ? ink : {};

  const view = localStorage.getItem(LS.view);
  if (['overview', 'all', 'claude', 'saved', 'notes'].includes(view)) state.view = view;

  const order = localStorage.getItem(LS.order);
  if (['mixed', 'time'].includes(order)) state.order = order;

  const readerLayout = localStorage.getItem(LS.readerLayout);
  if (['center', 'split', 'fullscreen'].includes(readerLayout)) {
    state.ui.readerLayout = readerLayout;
  }
  const rawSplitWidth = localStorage.getItem(LS.splitWidth);
  if (rawSplitWidth !== null) {
    const splitWidth = Number(rawSplitWidth);
    if (Number.isFinite(splitWidth) && splitWidth >= 320) {
      state.ui.splitWidth = Math.min(900, Math.max(320, splitWidth));
    }
  }
  const rawFontSize = localStorage.getItem(LS.readerFontSize);
  if (rawFontSize !== null) {
    const readerFontSize = Number(rawFontSize);
    if (Number.isFinite(readerFontSize)) {
      state.ui.readerFontSize = Math.min(24, Math.max(14, Math.round(readerFontSize)));
    }
  }
  const rawReaderWidth = localStorage.getItem(LS.readerWidth);
  if (rawReaderWidth !== null) {
    const width = Number(rawReaderWidth);
    if (Number.isFinite(width)) {
      state.ui.readerWidth = Math.min(1400, Math.max(520, Math.round(width)));
    }
  }
  const rawReaderHeight = localStorage.getItem(LS.readerHeight);
  if (rawReaderHeight !== null) {
    const height = Number(rawReaderHeight);
    if (Number.isFinite(height) && height >= 300) {
      state.ui.readerHeight = Math.min(2000, Math.round(height));
    }
  }
  const rawColumnWidth = localStorage.getItem(LS.readerColumnWidth);
  if (rawColumnWidth !== null) {
    const width = Number(rawColumnWidth);
    if (Number.isFinite(width)) {
      state.ui.readerColumnWidth = Math.min(1100, Math.max(520, Math.round(width)));
    }
  }
}

export function persistOrder() {
  try {
    localStorage.setItem(LS.order, state.order);
  } catch {
    // Ignore.
  }
}

export function persistReaderLayout() {
  try {
    localStorage.setItem(LS.readerLayout, state.ui.readerLayout);
  } catch {
    // Ignore.
  }
}

export function persistSplitWidth() {
  try {
    localStorage.setItem(LS.splitWidth, String(Math.round(state.ui.splitWidth)));
  } catch {
    // Ignore.
  }
}

export function persistReaderFontSize() {
  try {
    localStorage.setItem(LS.readerFontSize, String(state.ui.readerFontSize));
  } catch {
    // Ignore.
  }
}

export function persistReaderSize() {
  try {
    localStorage.setItem(LS.readerWidth, String(Math.round(state.ui.readerWidth)));
    localStorage.setItem(LS.readerHeight, String(Math.round(state.ui.readerHeight || 0)));
  } catch {
    // Ignore.
  }
}

export function persistReaderColumnWidth() {
  try {
    localStorage.setItem(LS.readerColumnWidth, String(Math.round(state.ui.readerColumnWidth)));
  } catch {
    // Ignore.
  }
}

export function persistInk() {
  const colors = new Set(['primary', 'secondary', 'danger', 'text']);
  const entries = Object.entries(state.ink || {})
    .map(([id, entry]) => {
      const rawStrokes = Array.isArray(entry?.strokes) ? entry.strokes.slice(-160) : [];
      const strokes = rawStrokes
        .map((stroke) => {
          const points = Array.isArray(stroke?.points) ? stroke.points.slice(0, 500) : [];
          return {
            color: colors.has(stroke?.color) ? stroke.color : 'primary',
            width: Math.min(12, Math.max(1, Number(stroke?.width) || 4)),
            points: points
              .map((point) => [
                Math.round(Math.min(1000, Math.max(0, Number(point?.[0]) || 0)) * 10) / 10,
                Math.round(Math.min(1000, Math.max(0, Number(point?.[1]) || 0)) * 10) / 10,
              ])
              .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)),
          };
        })
        .filter((stroke) => stroke.points.length);
      return [id, { strokes, updatedAt: entry?.updatedAt || new Date().toISOString() }];
    })
    .filter(([, entry]) => entry.strokes.length)
    .sort(
      (a, b) =>
        (Date.parse(b[1].updatedAt) || 0) - (Date.parse(a[1].updatedAt) || 0)
    )
    .slice(0, 40);
  state.ink = Object.fromEntries(entries);
  writeJSON(LS.ink, state.ink);
}

export function persistRead() {
  writeJSON(LS.read, [...state.read].slice(-MAX_READ));
}

export function persistSaved() {
  writeJSON(LS.saved, [...state.saved].slice(-MAX_SAVED));
}

export function persistNotes() {
  writeJSON(LS.notes, state.notes);
}

export function persistAI() {
  const entries = Object.entries(state.ai)
    .filter(([, value]) => value && value.data)
    .sort((a, b) => {
      const ta = Date.parse(a[1].generatedAt || 0) || 0;
      const tb = Date.parse(b[1].generatedAt || 0) || 0;
      return tb - ta;
    })
    .slice(0, MAX_AI);
  state.ai = Object.fromEntries(entries);
  writeJSON(LS.ai, state.ai);
}

export function persistView() {
  try {
    localStorage.setItem(LS.view, state.view);
  } catch {
    // Ignore.
  }
}

export function applyTheme(theme) {
  const next = THEMES.includes(theme) ? theme : 'aurora';
  state.theme = next;
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(LS.theme, next);
  } catch {
    // Ignore.
  }
  if (window.radar?.setTheme) window.radar.setTheme(next);
  return next;
}

export function setSources(sources) {
  state.sources = Array.isArray(sources) ? sources : [];
}

export function setFeeds(snapshot) {
  if (!snapshot) return;
  state.feeds = snapshot.sources || {};
  state.updatedAt = snapshot.updatedAt || null;
  state.stale = !!snapshot.stale;
}

export function sourceMap() {
  return Object.fromEntries(state.sources.map((source) => [source.id, source]));
}

export function allItems() {
  const sources = sourceMap();
  const list = [];
  const seen = new Set();
  for (const [sourceId, entry] of Object.entries(state.feeds)) {
    const source =
      sources[sourceId] || {
        id: sourceId,
        name: sourceId,
        title: sourceId,
        mark: sourceId.slice(0, 2).toUpperCase(),
      };
    for (const item of entry?.items || []) {
      if (!item || !item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      list.push({ ...item, source });
    }
  }
  list.sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.title).localeCompare(String(b.title));
  });
  return list;
}

export function getItem(id) {
  const found = allItems().find((item) => item.id === id);
  if (found) return found;
  const note = state.notes[id];
  if (!note) return null;
  return {
    id: note.id,
    title: note.title,
    link: note.link,
    sourceId: note.sourceId,
    publishedAt: note.updatedAt,
    summary: note.text,
    tags: [],
    meta: {},
    source:
      sourceMap()[note.sourceId] || {
        id: note.sourceId,
        name: note.sourceId,
        title: note.sourceId,
        mark: String(note.sourceId || 'NA').slice(0, 2).toUpperCase(),
      },
  };
}

function mixBySource(items) {
  const groups = new Map();
  for (const item of items) {
    if (!groups.has(item.sourceId)) groups.set(item.sourceId, []);
    groups.get(item.sourceId).push(item);
  }
  const queues = [...groups.values()].sort((a, b) => {
    const ta = Date.parse(a[0]?.publishedAt || 0) || 0;
    const tb = Date.parse(b[0]?.publishedAt || 0) || 0;
    return tb - ta;
  });
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      if (queue.length) {
        out.push(queue.shift());
        added = true;
      }
    }
  }
  return out;
}

export function filterItems() {
  let items = allItems();
  if (state.view === 'claude') items = items.filter((item) => item.sourceId === 'claude');
  if (state.view === 'saved') items = items.filter((item) => state.saved.has(item.id));
  if (state.sourceFilter !== 'all') {
    items = items.filter((item) => item.sourceId === state.sourceFilter);
  }
  if (state.unreadOnly) items = items.filter((item) => !state.read.has(item.id));
  const query = state.query.trim().toLowerCase();
  if (query) {
    items = items.filter((item) => {
      const haystack = `${item.title} ${item.summary} ${(item.tags || []).join(' ')} ${
        item.author || ''
      } ${item.source?.name || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }
  if (
    state.view === 'all' &&
    state.sourceFilter === 'all' &&
    state.order === 'mixed' &&
    !query
  ) {
    items = mixBySource(items);
  }
  return items;
}

export function claudeItems() {
  return allItems().filter((item) => item.sourceId === 'claude');
}

export function sourceCounts() {
  const counts = {};
  for (const [sourceId, entry] of Object.entries(state.feeds)) {
    counts[sourceId] = entry?.items?.length || 0;
  }
  return counts;
}

export function unreadCount(items = null) {
  const list = items || allItems();
  return list.filter((item) => !state.read.has(item.id)).length;
}

export function recentCount(hours = 24) {
  const limit = Date.now() - hours * 3600 * 1000;
  return allItems().filter((item) => {
    const ts = item.publishedAt ? Date.parse(item.publishedAt) : 0;
    return ts && ts >= limit;
  }).length;
}

export function notesList() {
  return Object.values(state.notes)
    .filter((note) => note && note.id)
    .sort((a, b) => (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0));
}

export function claudeNotes() {
  return notesList().filter((note) => note.sourceId === 'claude');
}

export function getNote(id) {
  return state.notes[id] || null;
}

export function saveNote(item, text) {
  const value = String(text ?? '');
  if (!value.trim()) {
    if (state.notes[item.id]) {
      delete state.notes[item.id];
      persistNotes();
    }
    return null;
  }
  const note = {
    id: item.id,
    title: item.title,
    link: item.link,
    sourceId: item.sourceId,
    text: value,
    updatedAt: new Date().toISOString(),
  };
  state.notes[item.id] = note;
  persistNotes();
  return note;
}

export function deleteNote(id) {
  if (state.notes[id]) {
    delete state.notes[id];
    persistNotes();
    return true;
  }
  return false;
}

export function markRead(id) {
  if (!id || state.read.has(id)) return false;
  state.read.add(id);
  persistRead();
  return true;
}

export function toggleSaved(id) {
  if (!id) return false;
  if (state.saved.has(id)) {
    state.saved.delete(id);
    persistSaved();
    return false;
  }
  state.saved.add(id);
  persistSaved();
  return true;
}

export function setAISummary(id, result) {
  if (!id || !result) return;
  state.ai[id] = result;
  persistAI();
}

export function getAISummary(id) {
  return state.ai[id] || null;
}

export function clearReadHistory() {
  state.read = new Set();
  persistRead();
}

export function clearAllLocal() {
  state.read = new Set();
  state.saved = new Set();
  state.notes = {};
  state.ai = {};
  state.ink = {};
  persistRead();
  persistSaved();
  persistNotes();
  persistAI();
  persistInk();
}

export function clearFeedCacheLocal() {
  state.feeds = {};
  state.updatedAt = null;
  state.stale = true;
}

export { THEMES, LS };

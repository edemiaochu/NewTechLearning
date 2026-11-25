/* Renderer state, local persistence and derived selectors. */

const LS = {
  theme: 'fr.theme',
  themeGray: 'fr.themeGray',
  glassAlpha: 'fr.glassAlpha',
  glassParams: 'fr.glassParams',
  glassBackground: 'fr.glassBackground',
  glassAnimation: 'fr.glassAnimation',
  opticalGlass: 'fr.opticalGlass',
  sidebarWidth: 'fr.sidebarWidth',
  sidebarCollapsed: 'fr.sidebarCollapsed',
  dictionaryOn: 'fr.dictionaryOn',
  read: 'fr.read',
  saved: 'fr.saved',
  notes: 'fr.notes',
  ai: 'fr.ai',
  newsDigest: 'fr.newsDigest',
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

const THEMES = [
  'aurora',
  'ocean',
  'forest',
  'ember',
  'violet',
  'black',
  'graphite',
  'light',
];
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
  themeGray: { black: 3, graphite: 14 },
  glassAlpha: 100,
  glassParams: null,
  glassBackground: 'clean',
  glassAnimation: false,
  opticalGlass: true,
  read: new Set(),
  saved: new Set(),
  notes: {},
  ai: {},
  newsDigest: null,
  ink: {},
  settings: {
    hasApiKey: false,
    keyHint: '',
    autoRefresh: true,
    autoNewsDigest: true,
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
    newsDigestLoading: false,
    newsDigestError: null,
    newsDigestFingerprint: null,
    digestOpen: false,
    activeItem: null,
    article: null,
    articleLoading: false,
    articleError: null,
    aiLoading: false,
    aiError: null,
    modal: null,
    themeOpen: false,
    glassParamsOpen: false,
    dictionaryOn: true,
    dictionary: null,
    settingsNotice: null,
    sidebarWidth: 262,
    sidebarCollapsed: false,
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

  const glassBackground = localStorage.getItem(LS.glassBackground);
  if (['clean', 'specimen', 'solid', 'image'].includes(glassBackground)) {
    state.glassBackground = glassBackground;
  }
  state.glassAnimation = localStorage.getItem(LS.glassAnimation) === '1';
  state.opticalGlass = localStorage.getItem(LS.opticalGlass) !== '0';

  const rawGlassAlpha = localStorage.getItem(LS.glassAlpha);
  if (rawGlassAlpha != null && rawGlassAlpha !== '') {
    const glassAlpha = Number(rawGlassAlpha);
    if (Number.isFinite(glassAlpha) && glassAlpha >= 0 && glassAlpha <= 100) {
      state.glassAlpha = glassAlpha;
    }
  }
  document.documentElement.style.setProperty('--glass-alpha', String(state.glassAlpha / 100));

  const grays = readJSON(LS.themeGray, null);
  if (grays && typeof grays === 'object') {
    for (const key of ['black', 'graphite']) {
      const value = Number(grays[key]);
      if (Number.isFinite(value)) state.themeGray[key] = Math.min(20, Math.max(0, value));
    }
  }
  if (state.theme === 'black' || state.theme === 'graphite') {
    document.documentElement.style.setProperty(
      '--theme-gray',
      String(state.themeGray[state.theme])
    );
  }

  const glassParams = readJSON(LS.glassParams, null);
  state.glassParams =
    glassParams && typeof glassParams === 'object' && !Array.isArray(glassParams)
      ? glassParams
      : null;

  const sidebarWidth = Number(localStorage.getItem(LS.sidebarWidth));
  if (Number.isFinite(sidebarWidth) && sidebarWidth >= 200 && sidebarWidth <= 380) {
    state.ui.sidebarWidth = sidebarWidth;
  }
  state.ui.sidebarCollapsed = localStorage.getItem(LS.sidebarCollapsed) === '1';
  state.ui.dictionaryOn = localStorage.getItem(LS.dictionaryOn) !== '0';

  const read = readJSON(LS.read, []);
  state.read = new Set(Array.isArray(read) ? read.slice(-MAX_READ) : []);

  const saved = readJSON(LS.saved, []);
  state.saved = new Set(Array.isArray(saved) ? saved.slice(-MAX_SAVED) : []);

  const notes = readJSON(LS.notes, {});
  state.notes = notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {};

  const ai = readJSON(LS.ai, {});
  state.ai = ai && typeof ai === 'object' && !Array.isArray(ai) ? ai : {};

  const newsDigest = readJSON(LS.newsDigest, null);
  state.newsDigest =
    newsDigest && typeof newsDigest === 'object' && newsDigest.data ? newsDigest : null;

  const ink = readJSON(LS.ink, {});
  state.ink = ink && typeof ink === 'object' && !Array.isArray(ink) ? ink : {};

  const view = localStorage.getItem(LS.view);
  if (['overview', 'news', 'all', 'claude', 'saved', 'notes'].includes(view)) state.view = view;

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

export function setNewsDigest(entry) {
  state.newsDigest = entry && entry.data ? entry : null;
  try {
    localStorage.setItem(LS.newsDigest, JSON.stringify(state.newsDigest));
  } catch {
    // Ignore.
  }
}

export function clearNewsDigest() {
  state.newsDigest = null;
  try {
    localStorage.removeItem(LS.newsDigest);
  } catch {
    // Ignore.
  }
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
  if (next === 'black' || next === 'graphite') {
    document.documentElement.style.setProperty(
      '--theme-gray',
      String(state.themeGray[next])
    );
  } else {
    document.documentElement.style.removeProperty('--theme-gray');
  }
  try {
    localStorage.setItem(LS.theme, next);
  } catch {
    // Ignore.
  }
  if (window.radar?.setTheme) window.radar.setTheme(next);
  return next;
}

/** Scale the seven floating glass surfaces without touching text or geometry. */
export function applyGlassAlpha(value) {
  const numeric = Number(value);
  const next = Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 100;
  state.glassAlpha = next;
  document.documentElement.style.setProperty('--glass-alpha', String(next / 100));
  try {
    localStorage.setItem(LS.glassAlpha, String(next));
  } catch {
    // Ignore.
  }
  return next;
}

/** Grayscale knob for `black` / `graphite`; ignored by the other themes. */
export function applyThemeGray(value) {
  const theme = state.theme;
  if (theme !== 'black' && theme !== 'graphite') return null;
  const numeric = Number(value);
  const next = Number.isFinite(numeric) ? Math.min(20, Math.max(0, Math.round(numeric))) : 3;
  state.themeGray[theme] = next;
  document.documentElement.style.setProperty('--theme-gray', String(next));
  writeJSON(LS.themeGray, state.themeGray);
  return next;
}

export function isGrayscaleTheme(theme = state.theme) {
  return theme === 'black' || theme === 'graphite';
}

export function setDictionaryOn(enabled) {
  state.ui.dictionaryOn = !!enabled;
  try {
    localStorage.setItem(LS.dictionaryOn, state.ui.dictionaryOn ? '1' : '0');
  } catch {
    // Ignore.
  }
  return state.ui.dictionaryOn;
}

export function setGlassParams(params) {
  state.glassParams = params && typeof params === 'object' ? params : null;
  writeJSON(LS.glassParams, state.glassParams);
  return state.glassParams;
}

export function setGlassBackground(mode) {
  const next = ['clean', 'specimen', 'solid', 'image'].includes(mode) ? mode : 'clean';
  state.glassBackground = next;
  try {
    localStorage.setItem(LS.glassBackground, next);
  } catch {
    // Ignore.
  }
  return next;
}

export function setGlassAnimation(enabled) {
  state.glassAnimation = !!enabled;
  try {
    localStorage.setItem(LS.glassAnimation, state.glassAnimation ? '1' : '0');
  } catch {
    // Ignore.
  }
  return state.glassAnimation;
}

export function setOpticalGlass(enabled) {
  state.opticalGlass = !!enabled;
  try {
    localStorage.setItem(LS.opticalGlass, state.opticalGlass ? '1' : '0');
  } catch {
    // Ignore.
  }
  return state.opticalGlass;
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
  state.newsDigest = null;
  state.ink = {};
  persistRead();
  persistSaved();
  persistNotes();
  persistAI();
  clearNewsDigest();
  persistInk();
}

export function clearFeedCacheLocal() {
  state.feeds = {};
  state.updatedAt = null;
  state.stale = true;
  state.newsDigest = null;
  try {
    localStorage.removeItem(LS.newsDigest);
  } catch {
    // Ignore.
  }
}

export { THEMES, LS };

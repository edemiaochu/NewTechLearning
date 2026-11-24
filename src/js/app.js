import {
  state,
  hydrateLocal,
  applyTheme,
  setSources,
  setFeeds,
  persistView,
  persistOrder,
  persistReaderLayout,
  persistSplitWidth,
  persistReaderFontSize,
  persistReaderSize,
  persistReaderColumnWidth,
  persistInk,
  allItems,
  getItem,
  notesList,
  saveNote,
  deleteNote,
  markRead,
  toggleSaved,
  setAISummary,
  setNewsDigest,
  clearReadHistory,
  clearFeedCacheLocal,
} from './state.js';
import {
  newsItems,
  selectScope,
  buildHotEvents,
  digestFingerprint,
} from './news.js';
import {
  renderSidebar,
  renderMain,
  renderOverlay,
  renderReaderContent,
  renderReaderPanel,
  renderInkStrokes,
  renderFontPopover,
  viewTitle,
} from './views.js';
import {
  icon,
  esc,
  toast,
  debounce,
  formatDateTime,
  todayLabel,
  clampText,
} from './ui.js';

const api = window.radar;
const $ = (selector, root = document) => root.querySelector(selector);

const els = {
  sidebar: $('#sidebar'),
  main: $('#main'),
  overlay: $('#overlay-root'),
  split: $('#reader-split'),
  splitResizer: $('#split-resizer'),
  toolbarTitle: $('#toolbar-title'),
  search: $('#search'),
  searchClear: $('#search-clear'),
  refreshBtn: $('#refresh-btn'),
  refreshIcon: $('#refresh-icon'),
  themeBtn: $('#theme-btn'),
  settingsBtn: $('#settings-btn'),
  maxBtn: $('#max-btn'),
};

let articleCache = new Map();
let refreshPromise = null;
let newsDigestPromise = null;
let newsDigestAttemptKey = null;
let autoRefreshTimer = null;
let noteStatusTimer = null;
let themePosition = { top: 64, right: 16 };
let fontPosition = { top: 64, right: 16 };
let lastOpenedId = null;
let splitSignature = '';
let pdfExporting = false;

const MAXIMIZE_SVG =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="4.5" y="4.5" width="7" height="7" rx="1.2" stroke="currentColor" stroke-width="1.3"/></svg>';
const RESTORE_SVG =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="6" height="6" rx="1" stroke="currentColor" stroke-width="1.25"/><path d="M6.5 3.5h5a1.5 1.5 0 0 1 1.5 1.5v5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>';

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function renderSidebarOnly() {
  els.sidebar.innerHTML = renderSidebar();
}

function renderMainOnly(preserveScroll = false) {
  const top = preserveScroll ? els.main.scrollTop : 0;
  els.main.innerHTML = renderMain();
  if (preserveScroll) els.main.scrollTop = top;
  if (state.view === 'news') setTimeout(maybeAutoNewsDigest, 0);
}

function renderOverlayUI() {
  const hadOverlay = !!els.overlay.querySelector('.reader-overlay, .lg-overlay');
  const previousScroll = els.overlay.querySelector('.reader-scroll')?.scrollTop || 0;
  els.overlay.innerHTML = renderOverlay(themePosition, fontPosition);
  if (hadOverlay) {
    els.overlay
      .querySelectorAll('.reader-overlay, .reader-panel, .lg-overlay, .lg-modal')
      .forEach((element) => element.classList.add('no-anim'));
  }
  const nextScroll = els.overlay.querySelector('.reader-scroll');
  if (nextScroll && previousScroll) nextScroll.scrollTop = previousScroll;
}

/** Refresh only the article region, leaving the reader shell (and note input) intact. */
function refreshReaderContent() {
  if (!state.ui.activeItem) return;
  const targets = [
    els.overlay.querySelector('#reader-content'),
    els.split?.querySelector('#reader-content'),
  ].filter(Boolean);
  if (!targets.length) {
    if (state.ui.readerLayout === 'split') renderSplitReader(true);
    else renderOverlayUI();
    return;
  }
  const html = renderReaderContent();
  targets.forEach((target) => {
    target.innerHTML = html;
  });
}

function updatePenToolbar() {
  document.querySelectorAll('.reader-pen-btn').forEach((button) => {
    button.classList.toggle('is-active', state.ui.penActive);
    button.setAttribute('aria-pressed', String(state.ui.penActive));
  });
  document.querySelectorAll('[data-action="pen-color"]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.color === state.ui.penColor);
  });
  document.querySelectorAll('[data-action="pen-width"]').forEach((button) => {
    button.classList.toggle(
      'is-active',
      Number(button.dataset.width) === state.ui.penWidth
    );
  });
  document.querySelectorAll('[data-action="pen-eraser"]').forEach((button) => {
    button.classList.toggle('is-active', state.ui.penEraser);
  });
  document.querySelectorAll('.reader-ink').forEach((svg) => {
    svg.classList.toggle('is-erasing', state.ui.penEraser);
  });
}

function setPenActive(active) {
  if (active && !state.ui.article) {
    toast('正文还未加载完成，请稍后再试', 'warn');
    return;
  }
  state.ui.penActive = !!active;
  if (!state.ui.penActive) state.ui.penEraser = false;
  document.querySelectorAll('.reader-pen-toolbar').forEach((bar) => {
    bar.hidden = !state.ui.penActive;
  });
  document.querySelectorAll('.reader-ink').forEach((svg) => {
    svg.classList.toggle('is-active', state.ui.penActive);
  });
  updatePenToolbar();
}

function togglePen() {
  setPenActive(!state.ui.penActive);
}

function setPenColor(color) {
  if (!['primary', 'secondary', 'danger', 'text'].includes(color)) return;
  state.ui.penColor = color;
  updatePenToolbar();
}

function setPenWidth(width) {
  const next = Math.min(12, Math.max(1, Number(width) || 4));
  state.ui.penWidth = next;
  updatePenToolbar();
}

function togglePenEraser() {
  state.ui.penEraser = !state.ui.penEraser;
  updatePenToolbar();
}

function refreshInkLayer() {
  const item = state.ui.activeItem;
  document.querySelectorAll('.reader-ink').forEach((svg) => {
    svg.innerHTML = item ? renderInkStrokes(item.id) : '';
    svg.classList.toggle('is-active', state.ui.penActive);
  });
  updatePenToolbar();
}

function undoInk() {
  const item = state.ui.activeItem;
  const entry = item && state.ink[item.id];
  if (!entry?.strokes?.length) {
    toast('没有可撤销的笔迹', 'warn');
    return;
  }
  entry.strokes.pop();
  entry.updatedAt = new Date().toISOString();
  if (!entry.strokes.length) delete state.ink[item.id];
  persistInk();
  refreshInkLayer();
}

function clearInk() {
  const item = state.ui.activeItem;
  if (!item || !state.ink[item.id]?.strokes?.length) {
    toast('当前文章还没有笔迹', 'warn');
    return;
  }
  if (!window.confirm('清空当前文章的全部笔迹？')) return;
  delete state.ink[item.id];
  persistInk();
  refreshInkLayer();
}

function eraseInkAt(layer, event) {
  const item = state.ui.activeItem;
  const entry = item && state.ink[item.id];
  if (!entry?.strokes?.length) return;
  const rect = layer.getBoundingClientRect();
  let bestIndex = -1;
  let bestDistance = 18;
  entry.strokes.forEach((stroke, index) => {
    for (const point of stroke.points || []) {
      const x = rect.left + (Number(point[0]) / 1000) * rect.width;
      const y = rect.top + (Number(point[1]) / 1000) * rect.height;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
  });
  if (bestIndex < 0) return;
  entry.strokes.splice(bestIndex, 1);
  entry.updatedAt = new Date().toISOString();
  if (!entry.strokes.length) delete state.ink[item.id];
  persistInk();
  refreshInkLayer();
}

function inkPath(points) {
  if (!points.length) return '';
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  if (points.length === 1) return `${d} l 0.1 0`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`;
  }
  return d;
}

function bindPen() {
  let drawing = false;
  let layer = null;
  let itemId = null;
  let stroke = null;
  let livePath = null;

  const pointFromEvent = (svg, event) => {
    const rect = svg.getBoundingClientRect();
    return [
      Math.min(1000, Math.max(0, ((event.clientX - rect.left) / rect.width) * 1000)),
      Math.min(1000, Math.max(0, ((event.clientY - rect.top) / rect.height) * 1000)),
    ];
  };

  const onMove = (event) => {
    if (!drawing || !layer || !stroke || !livePath) return;
    const point = pointFromEvent(layer, event);
    const last = stroke.points[stroke.points.length - 1];
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 1.6) return;
    if (stroke.points.length < 1200) stroke.points.push(point);
    livePath.setAttribute('d', inkPath(stroke.points));
  };

  const finishStroke = () => {
    if (!drawing) return;
    drawing = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finishStroke);
    window.removeEventListener('pointercancel', finishStroke);
    if (stroke && itemId && stroke.points.length) {
      const entry = state.ink[itemId] || { strokes: [], updatedAt: null };
      entry.strokes.push({
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map(([x, y]) => [
          Math.round(x * 10) / 10,
          Math.round(y * 10) / 10,
        ]),
      });
      if (entry.strokes.length > 160) entry.strokes = entry.strokes.slice(-160);
      entry.updatedAt = new Date().toISOString();
      state.ink[itemId] = entry;
      persistInk();
    }
    stroke = null;
    livePath = null;
    layer = null;
    itemId = null;
  };

  document.addEventListener('pointerdown', (event) => {
    if (!state.ui.penActive || event.button !== 0 || drawing) return;
    const svg = event.target.closest('.reader-ink.is-active');
    if (!svg) return;
    const item = state.ui.activeItem;
    if (!item || !state.ui.article) return;
    event.preventDefault();
    if (state.ui.penEraser) {
      eraseInkAt(svg, event);
      return;
    }
    drawing = true;
    layer = svg;
    itemId = item.id;
    stroke = {
      color: state.ui.penColor,
      width: state.ui.penWidth,
      points: [pointFromEvent(svg, event)],
    };
    livePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    livePath.setAttribute('class', `ink-stroke ink-${stroke.color}`);
    livePath.setAttribute('stroke-width', String(stroke.width));
    livePath.setAttribute('vector-effect', 'non-scaling-stroke');
    livePath.setAttribute('d', inkPath(stroke.points));
    svg.appendChild(livePath);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finishStroke);
    window.addEventListener('pointercancel', finishStroke);
  });
}

function splitMaxWidth() {
  return Math.max(400, Math.min(720, window.innerWidth - 700));
}

function splitWidthValue() {
  return Math.min(splitMaxWidth(), Math.max(380, state.ui.splitWidth || 540));
}

function applySplitWidth() {
  if (!els.split) return;
  els.split.style.width = `${splitWidthValue()}px`;
}

function renderSplitReader(force = false) {
  if (!els.split || !els.splitResizer) return;
  const open = state.ui.readerLayout === 'split' && !!state.ui.activeItem;
  els.split.hidden = !open;
  els.splitResizer.hidden = !open;
  document.getElementById('app')?.classList.toggle('is-split-reading', open);
  if (!open) {
    if (els.split.innerHTML) els.split.innerHTML = '';
    splitSignature = '';
    return;
  }
  applySplitWidth();
  const signature = `${state.ui.activeItem.id}|${state.ui.readerLayout}`;
  if (!force && signature === splitSignature && els.split.querySelector('.reader-panel')) {
    return;
  }
  els.split.innerHTML = renderReaderPanel();
  splitSignature = signature;
  const scroller = els.split.querySelector('.reader-scroll');
  if (scroller) scroller.scrollTop = 0;
}

function setReaderLayout(layout) {
  if (!['center', 'split', 'fullscreen'].includes(layout)) return;
  if (layout === state.ui.readerLayout) return;
  state.ui.readerLayout = layout;
  persistReaderLayout();
  renderSplitReader(true);
  renderOverlayUI();
  if (state.ui.activeItem) {
    const labels = { center: '居中阅读', split: '分栏阅读', fullscreen: '全屏阅读' };
    toast(`已切换到${labels[layout]}`);
  }
}

function bindReaderWidthGrip() {
  let dragging = false;
  let startX = 0;
  let startW = 0;
  let lastW = 0;

  const onMove = (event) => {
    if (!dragging) return;
    const max = Math.min(1100, Math.max(520, window.innerWidth - 140));
    lastW = Math.min(max, Math.max(520, startW + 2 * (event.clientX - startX)));
    setReaderColumnWidth(lastW, { persist: false });
  };
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    persistReaderColumnWidth();
    updateReaderColumnWidthControls(state.ui.readerColumnWidth);
  };

  document.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('.reader-width-grip');
    if (!grip) return;
    const content = document.querySelector('.reader-overlay--fullscreen #reader-content');
    if (!content) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startW = content.getBoundingClientRect().width;
    lastW = startW;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });

  document.addEventListener('dblclick', (event) => {
    if (!event.target.closest('.reader-width-grip')) return;
    event.preventDefault();
    setReaderColumnWidth(760);
  });

  window.addEventListener('resize', applyReaderColumnWidth);
}

function bindReaderResize() {
  let dragging = false;
  let panel = null;
  let startX = 0;
  let startY = 0;
  let startW = 0;
  let startH = 0;
  let lastW = 0;
  let lastH = 0;

  const onMove = (event) => {
    if (!dragging || !panel) return;
    const maxW = Math.min(window.innerWidth * 0.94, window.innerWidth - 36);
    const maxH = Math.max(360, window.innerHeight - 94);
    lastW = Math.min(maxW, Math.max(520, startW + event.clientX - startX));
    lastH = Math.min(maxH, Math.max(360, startH + event.clientY - startY));
    panel.style.width = `${lastW}px`;
    panel.style.height = `${lastH}px`;
  };

  const finish = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    if (panel) {
      state.ui.readerWidth = Math.round(lastW);
      state.ui.readerHeight = Math.round(lastH);
      persistReaderSize();
    }
    panel = null;
  };

  document.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('.reader-resize-grip');
    if (!grip) return;
    const targetPanel = grip.closest('.reader-panel');
    if (!targetPanel) return;
    event.preventDefault();
    const rect = targetPanel.getBoundingClientRect();
    dragging = true;
    panel = targetPanel;
    startX = event.clientX;
    startY = event.clientY;
    startW = rect.width;
    startH = rect.height;
    lastW = rect.width;
    lastH = rect.height;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });

  document.addEventListener('dblclick', (event) => {
    const grip = event.target.closest('.reader-resize-grip');
    if (!grip) return;
    event.preventDefault();
    state.ui.readerWidth = 800;
    state.ui.readerHeight = 0;
    persistReaderSize();
    const targetPanel = grip.closest('.reader-panel');
    if (targetPanel) {
      targetPanel.style.width = '800px';
      targetPanel.style.height = '';
    }
  });
}

function bindSplitResizer() {
  const resizer = els.splitResizer;
  if (!resizer) return;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  const onMove = (event) => {
    if (!dragging) return;
    const delta = startX - event.clientX;
    state.ui.splitWidth = Math.min(splitMaxWidth(), Math.max(380, startWidth + delta));
    applySplitWidth();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('is-active');
    persistSplitWidth();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };

  resizer.addEventListener('pointerdown', (event) => {
    if (els.split.hidden) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    startWidth = splitWidthValue();
    resizer.classList.add('is-active');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

  resizer.addEventListener('dblclick', () => {
    if (els.split.hidden) return;
    state.ui.splitWidth = 540;
    applySplitWidth();
    persistSplitWidth();
  });

  window.addEventListener('resize', () => {
    if (!els.split.hidden) applySplitWidth();
  });
}

function renderToolbar() {
  els.toolbarTitle.textContent = viewTitle();
  updateSearchUI();
  updateRefreshButton();
}

function renderAll() {
  renderSidebarOnly();
  renderMainOnly();
  renderSplitReader();
  renderOverlayUI();
  renderToolbar();
}

function updateSearchUI() {
  const hasValue = !!els.search.value;
  els.searchClear.hidden = !hasValue;
  els.search.closest('.app-search')?.classList.toggle('has-value', hasValue);
  const iconEl = $('#search-icon');
  if (iconEl && !iconEl.dataset.filled) {
    iconEl.innerHTML = icon('search');
    iconEl.dataset.filled = '1';
  }
  const clearIcon = $('#search-clear-icon');
  if (clearIcon && !clearIcon.dataset.filled) {
    clearIcon.innerHTML = icon('close');
    clearIcon.dataset.filled = '1';
  }
}

function updateRefreshButton() {
  if (!els.refreshBtn) return;
  els.refreshBtn.disabled = state.ui.refreshing;
  els.refreshBtn.classList.toggle('is-active', state.ui.refreshing);
  if (els.refreshIcon) els.refreshIcon.classList.toggle('spin', state.ui.refreshing);
  els.refreshBtn.title = state.ui.refreshing ? '正在同步…' : '刷新资讯 (R)';
}

function updateMaxIcon(maximized) {
  if (!els.maxBtn) return;
  els.maxBtn.innerHTML = maximized ? RESTORE_SVG : MAXIMIZE_SVG;
  els.maxBtn.title = maximized ? '还原' : '最大化';
}

function fillStaticIcons() {
  const searchIcon = $('#search-icon');
  if (searchIcon) searchIcon.innerHTML = icon('search');
  const clearIcon = $('#search-clear-icon');
  if (clearIcon) clearIcon.innerHTML = icon('close');
  const refreshIcon = $('#refresh-icon');
  if (refreshIcon) refreshIcon.innerHTML = icon('refresh');
  const themeIcon = $('#theme-icon');
  if (themeIcon) themeIcon.innerHTML = icon('palette');
  const settingsIcon = $('#settings-icon');
  if (settingsIcon) settingsIcon.innerHTML = icon('settings');
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

function syncHash() {
  try {
    const next = `#${state.view}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  } catch {
    // Ignore.
  }
}

function setView(view, options = {}) {
  const allowed = ['overview', 'news', 'all', 'claude', 'saved', 'notes'];
  state.view = allowed.includes(view) ? view : 'overview';
  state.sourceFilter = options.source || 'all';
  state.unreadOnly = false;
  state.query = '';
  els.search.value = '';
  if (state.ui.readerLayout !== 'split') closeReader({ silent: true });
  state.ui.modal = null;
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  setFontButtonActive();
  persistView();
  syncHash();
  renderAll();
  els.main.scrollTop = 0;
}

function setSourceFilter(sourceId) {
  const keepSaved = state.view === 'saved';
  state.view = keepSaved ? 'saved' : 'all';
  state.sourceFilter = sourceId || 'all';
  state.query = '';
  state.unreadOnly = false;
  els.search.value = '';
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  setFontButtonActive();
  persistView();
  syncHash();
  renderAll();
  els.main.scrollTop = 0;
}

function setNewsSourceFilter(sourceId) {
  state.view = 'news';
  state.sourceFilter = sourceId || 'all';
  state.query = '';
  state.unreadOnly = false;
  els.search.value = '';
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  setFontButtonActive();
  persistView();
  syncHash();
  renderAll();
  els.main.scrollTop = 0;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

const runSearch = debounce(() => {
  const next = els.search.value.trim();
  if (next === state.query) return;
  state.query = next;
  if (state.query && state.view === 'overview') {
    state.view = 'all';
    syncHash();
  }
  renderSidebarOnly();
  renderMainOnly();
  renderToolbar();
}, 160);

function clearSearch() {
  els.search.value = '';
  state.query = '';
  renderMainOnly();
  renderToolbar();
  els.main.scrollTop = 0;
}

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */

async function openReader(id) {
  const item = getItem(id);
  if (!item) {
    toast('找不到这篇文章，可能已经从缓存中移除', 'warn');
    return;
  }
  if (noteStatusTimer) {
    clearTimeout(noteStatusTimer);
    noteStatusTimer = null;
  }
  state.ui.modal = null;
  state.ui.themeOpen = false;
  state.ui.digestOpen = false;
  state.ui.activeItem = item;
  state.ui.article = articleCache.get(id) || null;
  state.ui.articleLoading = !state.ui.article;
  state.ui.articleError = null;
  state.ui.aiError = null;
  state.ui.aiLoading = false;
  state.ui.fontOpen = false;
  state.ui.penActive = false;
  state.ui.penEraser = false;
  setFontButtonActive();
  lastOpenedId = id;

  const changed = markRead(id);
  if (state.ui.readerLayout === 'split') {
    renderSplitReader(true);
    renderOverlayUI();
  } else {
    renderOverlayUI();
  }
  if (changed) {
    updateCardReadState(id);
    renderSidebarOnly();
  }
  if (!state.ui.article) loadArticle(item);
}

function updateCardReadState(id) {
  if (!id) return;
  const card = els.main.querySelector(`.feed-card[data-id="${CSS.escape(id)}"]`);
  if (card) {
    if (state.unreadOnly) card.remove();
    else {
      card.classList.add('is-read');
      card.querySelector('.unread-dot')?.remove();
    }
  }
  const newsRow = els.main.querySelector(
    `[data-open-id="${CSS.escape(id)}"].news-row`
  );
  if (newsRow) newsRow.classList.add('is-read');
}

async function loadArticle(item) {
  const requestId = item.id;
  try {
    const result = await api.loadArticle({
      id: item.id,
      link: item.link,
      sourceId: item.sourceId,
      title: item.title,
      summary: item.summary,
      publishedAt: item.publishedAt,
    });
    if (!state.ui.activeItem || state.ui.activeItem.id !== requestId) return;
    state.ui.articleLoading = false;
    if (result && result.ok) {
      articleCache.set(requestId, result);
      state.ui.article = result;
      state.ui.articleError = null;
    } else {
      state.ui.articleError = result?.message || '正文抓取失败';
    }
    if (articleCache.size > 24) {
      articleCache.delete(articleCache.keys().next().value);
    }
  } catch (err) {
    if (!state.ui.activeItem || state.ui.activeItem.id !== requestId) return;
    state.ui.articleLoading = false;
    state.ui.articleError = err?.message || '正文抓取失败';
  }
  refreshReaderContent();
}

function closeReader(options = {}) {
  const id = lastOpenedId;
  const wasOpen = !!state.ui.activeItem;
  state.ui.activeItem = null;
  state.ui.article = null;
  state.ui.articleLoading = false;
  state.ui.articleError = null;
  state.ui.aiLoading = false;
  state.ui.aiError = null;
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  state.ui.penActive = false;
  state.ui.penEraser = false;
  setFontButtonActive();
  lastOpenedId = null;
  if (noteStatusTimer) {
    clearTimeout(noteStatusTimer);
    noteStatusTimer = null;
  }
  if (!options.silent) {
    renderSplitReader(true);
    renderOverlayUI();
    if (wasOpen) {
      renderMainOnly(true);
      renderSidebarOnly();
      renderToolbar();
    }
  }
}

async function runAI() {
  const item = state.ui.activeItem;
  const article = state.ui.article;
  if (!item) return;
  if (!article || !article.text || article.text.trim().length < 80) {
    toast('正文内容不足，暂时无法生成精读', 'warn');
    return;
  }
  if (state.ui.aiLoading) return;

  state.ui.aiLoading = true;
  state.ui.aiError = null;
  refreshReaderContent();

  try {
    const result = await api.summarizeAI({
      title: article.title || item.title,
      source: item.source?.name || item.sourceId,
      url: item.link,
      text: article.text,
    });
    if (!state.ui.activeItem || state.ui.activeItem.id !== item.id) return;
    state.ui.aiLoading = false;
    if (result && result.ok) {
      setAISummary(item.id, result);
      toast('AI 精读已生成', 'success');
    } else {
      state.ui.aiError = result?.message || '生成失败，请稍后重试';
      if (['no_key', 'no_base_url', 'local_config_missing'].includes(result?.code)) {
        state.ui.modal = 'settings';
        toast(result?.message || '请先配置 AI 服务', 'warn');
      }
    }
  } catch (err) {
    state.ui.aiLoading = false;
    state.ui.aiError = err?.message || '生成失败，请稍后重试';
  }
  if (state.ui.modal === 'settings') renderOverlayUI();
  else if (state.ui.activeItem) refreshReaderContent();
}

/* ------------------------------------------------------------------ */
/* Notes                                                               */
/* ------------------------------------------------------------------ */

function handleNoteInput(textarea) {
  const item = state.ui.activeItem;
  if (!item) return;
  saveNote(item, textarea.value);
  const status = $('#note-status');
  if (status) {
    status.textContent = textarea.value.trim() ? '保存中…' : '笔记已清空';
    status.classList.remove('is-saved');
  }
  if (noteStatusTimer) clearTimeout(noteStatusTimer);
  noteStatusTimer = setTimeout(() => {
    const liveStatus = $('#note-status');
    if (liveStatus) {
      liveStatus.textContent = '已保存 · 刚刚';
      liveStatus.classList.add('is-saved');
    }
    renderSidebarOnly();
  }, 650);
}

function buildNotesMarkdown() {
  const notes = notesList();
  const sources = Object.fromEntries(state.sources.map((source) => [source.id, source]));
  const lines = [
    '# 前沿雷达 · 学习笔记',
    '',
    `> 导出时间：${formatDateTime(new Date())}`,
    `> 共 ${notes.length} 篇笔记`,
    '',
  ];
  for (const note of notes) {
    const source = sources[note.sourceId];
    lines.push(`## ${note.title}`, '');
    lines.push(`- 来源：${source?.title || source?.name || note.sourceId}`);
    lines.push(`- 链接：${note.link}`);
    lines.push(`- 更新：${formatDateTime(note.updatedAt)}`);
    lines.push('', note.text, '', '---', '');
  }
  return lines.join('\n');
}

async function exportNotes() {
  const notes = notesList();
  if (!notes.length) {
    toast('还没有可以导出的笔记', 'warn');
    return;
  }
  const result = await api.exportNotes(buildNotesMarkdown());
  if (result?.saved) toast('学习笔记已导出', 'success');
  else if (result?.error) toast(`导出失败：${result.error}`, 'warn');
}

async function exportArticlePDF() {
  const item = state.ui.activeItem;
  const article = state.ui.article;
  if (!item || !article) {
    toast('正文还未加载完成，请稍后再试', 'warn');
    return;
  }
  if (pdfExporting) return;

  pdfExporting = true;
  try {
    const ai = state.ai[item.id];
    const note = state.notes[item.id];
    const result = await api.exportArticlePdf({
      title: article.title || item.title,
      source: item.source?.name || item.sourceId,
      siteName: article.siteName || '',
      author: article.author || item.author || '',
      publishedAt: article.publishedAt || item.publishedAt || '',
      url: item.link,
      summary: article.summary || null,
      ai: ai?.data || null,
      aiProvider: ai?.providerLabel || '',
      aiModel: ai?.model || '',
      note: note?.text || '',
      blocks: article.blocks || [],
    });
    if (result?.saved) toast('PDF 已导出', 'success');
    else if (result?.error) toast(`PDF 导出失败：${result.error}`, 'warn');
  } catch (err) {
    toast(`PDF 导出失败：${err?.message || '未知错误'}`, 'warn');
  } finally {
    pdfExporting = false;
  }
}

async function exportNotesPDF() {
  const notes = notesList();
  if (!notes.length) {
    toast('还没有可以导出的笔记', 'warn');
    return;
  }
  if (pdfExporting) return;

  pdfExporting = true;
  try {
    const sourceNames = Object.fromEntries(
      state.sources.map((source) => [source.id, source.title || source.name])
    );
    const result = await api.exportNotesPdf({
      notes: notes.map((note) => ({
        title: note.title,
        source: sourceNames[note.sourceId] || note.sourceId,
        link: note.link,
        updatedAt: note.updatedAt,
        text: note.text,
      })),
    });
    if (result?.saved) toast('学习笔记 PDF 已导出', 'success');
    else if (result?.error) toast(`PDF 导出失败：${result.error}`, 'warn');
  } catch (err) {
    toast(`PDF 导出失败：${err?.message || '未知错误'}`, 'warn');
  } finally {
    pdfExporting = false;
  }
}

async function handleDeleteNote(id) {
  if (!id) return;
  const ok = window.confirm('删除这篇学习笔记？此操作不可撤销。');
  if (!ok) return;
  deleteNote(id);
  renderSidebarOnly();
  renderMainOnly();
  toast('笔记已删除', 'success');
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

async function saveApiKey() {
  const input = $('#settings-api-key');
  const value = input?.value.trim();
  if (!value) {
    toast('请输入 API Key', 'warn');
    input?.focus();
    return;
  }
  const settings = await api.saveSettings({ apiKey: value });
  state.settings = settings;
  toast(settings.hasApiKey ? 'API Key 已保存' : 'API Key 保存失败', settings.hasApiKey ? 'success' : 'warn');
  resetNewsDigestAttempt();
  renderOverlayUI();
  renderSidebarOnly();
}

async function clearApiKey() {
  const settings = await api.saveSettings({ apiKey: '' });
  state.settings = settings;
  resetNewsDigestAttempt();
  toast('API Key 已清除');
  renderOverlayUI();
}

async function toggleAutoRefresh(enabled) {
  const settings = await api.saveSettings({ autoRefresh: enabled });
  state.settings = settings;
  scheduleAutoRefresh();
  renderSidebarOnly();
  toast(settings.autoRefresh ? '已开启自动同步' : '已关闭自动同步');
}

async function toggleAutoNewsDigest(enabled) {
  const settings = await api.saveSettings({ autoNewsDigest: enabled });
  state.settings = settings;
  renderOverlayUI();
  if (settings.autoNewsDigest) {
    newsDigestAttemptKey = null;
    toast('已开启今日 AI 概览自动整理');
    if (state.view === 'news') setTimeout(maybeAutoNewsDigest, 0);
  } else {
    toast('已关闭今日 AI 概览自动整理');
  }
}

async function setProxyMode(mode) {
  if (!['system', 'direct', 'manual'].includes(mode)) return;
  const settings = await api.saveSettings({ proxyMode: mode });
  state.settings = settings;
  if (settings.proxyStatus?.error) {
    toast(settings.proxyStatus.error, 'warn');
  } else {
    toast(
      mode === 'system'
        ? '已跟随系统代理'
        : mode === 'direct'
        ? '已切换为直连'
        : '已切换为手动代理'
    );
  }
  renderOverlayUI();
}

async function saveProxyUrl() {
  const input = $('#settings-proxy-url');
  const url = input?.value.trim() || '';
  const settings = await api.saveSettings({ proxyMode: 'manual', proxyUrl: url });
  state.settings = settings;
  if (settings.proxyStatus?.error) toast(settings.proxyStatus.error, 'warn');
  else toast('代理设置已保存', 'success');
  renderOverlayUI();
}

const AI_PROVIDER_DEFAULTS = {
  anthropic: { aiModel: 'claude-opus-5-5', aiBaseUrl: '' },
  deepseek: { aiModel: 'deepseek-chat', aiBaseUrl: '' },
  custom: { aiModel: '', aiBaseUrl: '' },
  'local-claude': { aiModel: '', aiBaseUrl: '' },
};

const AI_PROVIDER_LABELS = {
  anthropic: 'Anthropic 官方',
  deepseek: 'DeepSeek',
  custom: '自定义接口',
  'local-claude': 'Claude Code 本机配置',
};

async function setAiProvider(provider) {
  const defaults = AI_PROVIDER_DEFAULTS[provider];
  if (!defaults) return;
  const settings = await api.saveSettings({ aiProvider: provider, ...defaults });
  state.settings = settings;
  resetNewsDigestAttempt();
  if (provider === 'local-claude') {
    if (settings.localConfig?.ok) toast('已读取本机 Claude Code 配置', 'success');
    else toast(settings.localConfig?.error || '未检测到本机 Claude Code 配置', 'warn');
  } else {
    toast(`已切换为「${AI_PROVIDER_LABELS[provider]}」`);
  }
  renderOverlayUI();
}

async function saveAiConfig() {
  const model = $('#settings-ai-model')?.value.trim() || '';
  const baseInput = $('#settings-ai-base-url');
  const patch = { aiModel: model };
  if (baseInput) patch.aiBaseUrl = baseInput.value.trim();
  const settings = await api.saveSettings(patch);
  state.settings = settings;
  resetNewsDigestAttempt();
  toast('AI 配置已保存', 'success');
  renderOverlayUI();
}

async function reloadLocalConfig() {
  const settings = await api.getSettings();
  state.settings = settings;
  resetNewsDigestAttempt();
  if (settings.localConfig?.ok) toast('已读取本机 Claude Code 配置', 'success');
  else toast(settings.localConfig?.error || '未检测到本机 Claude Code 配置', 'warn');
  renderOverlayUI();
}

async function testNetwork() {
  const button = $('[data-action="test-network"]');
  const status = $('#proxy-test-status');
  if (button) button.disabled = true;
  if (status) {
    status.classList.remove('is-ok', 'is-error');
    status.textContent = '正在测试 claude.dev…';
  }
  let result;
  try {
    result = await api.testNetwork();
  } catch (err) {
    result = { ok: false, error: err?.message || '测试失败' };
  }
  if (button) button.disabled = false;
  if (!status) return;
  status.classList.remove('is-ok', 'is-error');
  if (result?.ok) {
    const route =
      result.route === 'direct'
        ? '直连'
        : result.rules === 'system'
        ? '系统代理'
        : result.rules === 'direct'
        ? '直连'
        : result.rules || '代理';
    status.textContent = `连接成功 · HTTP ${result.status} · ${result.ms} ms · ${route}`;
    status.classList.add('is-ok');
  } else {
    status.textContent = `连接失败${result?.status ? ` · HTTP ${result.status}` : ''} · ${
      result?.error || '未知错误'
    }`;
    status.classList.add('is-error');
  }
}

async function clearCache() {
  const ok = window.confirm('清除本地资讯缓存？收藏和笔记不会受影响，清除后会立即重新同步。');
  if (!ok) return;
  await api.clearFeeds();
  clearFeedCacheLocal();
  articleCache = new Map();
  renderAll();
  refreshAll({ force: true, manual: true });
}

/* ------------------------------------------------------------------ */
/* Refresh                                                             */
/* ------------------------------------------------------------------ */

function totalItems(snapshot = { sources: state.feeds }) {
  return Object.values(snapshot.sources || {}).reduce(
    (sum, entry) => sum + (entry?.items?.length || 0),
    0
  );
}

function refreshAll(options = {}) {
  if (refreshPromise) return refreshPromise;
  state.ui.refreshing = true;
  state.ui.refreshError = null;
  updateRefreshButton();
  renderSidebarOnly();
  if (options.manual || !allItems().length) renderMainOnly();

  refreshPromise = api
    .refreshFeeds({ force: !!options.force })
    .then((result) => {
      setFeeds(result);
      state.ui.lastReport = result.report || null;
      const errors = result.report?.errors || [];
      if (!options.silent) {
        if (errors.length) {
          toast(`同步完成，${errors.length} 个来源暂时失败`, 'warn');
        } else {
          const succeeded = result.report?.succeeded ?? state.sources.length;
          toast(`已同步 ${succeeded} 个来源 · 共 ${totalItems(result)} 条`, 'success');
        }
      }
      return result;
    })
    .catch((err) => {
      state.ui.refreshError = err?.message || '同步失败';
      if (!options.silent) toast(`同步失败：${state.ui.refreshError}`, 'warn');
      return api
        .loadFeeds()
        .then((snapshot) => {
          setFeeds(snapshot);
          return snapshot;
        })
        .catch(() => null);
    })
    .finally(() => {
      state.ui.refreshing = false;
      refreshPromise = null;
      updateRefreshButton();
      renderSidebarOnly();
      renderMainOnly(!!options.auto && !options.manual);
    });
  return refreshPromise;
}

/* ------------------------------------------------------------------ */
/* AI news digest                                                      */
/* ------------------------------------------------------------------ */

function digestCandidates(items) {
  const events = buildHotEvents(items);
  const seen = new Set();
  const candidates = [];
  const push = (item, coverage = 1) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    candidates.push({
      id: item.id,
      title: item.title,
      source: item.source?.name || item.sourceId || '',
      summary: clampText(item.summary || '', 220),
      publishedAt: item.publishedAt || '',
      coverage,
      heat: Number(item.meta?.points) || 0,
    });
  };
  for (const event of events.slice(0, 12)) {
    for (const item of event.members) push(item, event.coverage);
  }
  for (const item of items) push(item, 1);
  return candidates.slice(0, 36);
}

function currentNewsDigestContext() {
  const scope = selectScope(newsItems());
  return { scope, fingerprint: digestFingerprint(scope) };
}

function maybeAutoNewsDigest() {
  if (state.view !== 'news' || state.query || state.sourceFilter !== 'all') return;
  if (state.settings.autoNewsDigest === false) return;
  if (state.ui.newsDigestLoading || newsDigestPromise) return;
  const context = currentNewsDigestContext();
  if (!context.scope.items.length) return;
  if (state.newsDigest?.fingerprint === context.fingerprint) return;
  if (newsDigestAttemptKey === context.fingerprint) return;
  newsDigestAttemptKey = context.fingerprint;
  generateNewsDigest(context, { auto: true });
}

function generateNewsDigest(context = null, options = {}) {
  if (newsDigestPromise) return newsDigestPromise;
  const ctx = context || currentNewsDigestContext();
  const items = digestCandidates(ctx.scope.items);
  if (!items.length) return Promise.resolve(null);

  const fingerprint = ctx.fingerprint;
  newsDigestAttemptKey = fingerprint;
  state.ui.newsDigestLoading = true;
  state.ui.newsDigestError = null;
  state.ui.newsDigestFingerprint = fingerprint;
  if (state.view === 'news') renderMainOnly(true);

  const payload = {
    date: todayLabel(),
    scopeLabel: ctx.scope.label,
    fingerprint,
    items,
  };

  newsDigestPromise = api
    .summarizeNewsDigest(payload)
    .then((result) => {
      if (!result?.ok) {
        state.ui.newsDigestError = {
          code: result?.code || 'error',
          message: result?.message || 'AI 整理失败，请稍后重试',
        };
        if (!options.auto) toast(state.ui.newsDigestError.message, 'warn');
        return null;
      }
      const entry = {
        fingerprint,
        scopeLabel: ctx.scope.label,
        date: payload.date,
        itemCount: items.length,
        generatedAt: result.generatedAt,
        provider: result.provider,
        providerLabel: result.providerLabel,
        model: result.model,
        usage: result.usage || null,
        data: result.data,
      };
      setNewsDigest(entry);
      state.ui.newsDigestError = null;
      if (!options.auto) toast('AI 今日概览已更新', 'success');
      return entry;
    })
    .catch((err) => {
      state.ui.newsDigestError = {
        code: 'unexpected',
        message: err?.message || 'AI 整理失败',
      };
      if (!options.auto) {
        toast(`AI 整理失败：${state.ui.newsDigestError.message}`, 'warn');
      }
      return null;
    })
    .finally(() => {
      state.ui.newsDigestLoading = false;
      newsDigestPromise = null;
      if (state.view === 'news') renderMainOnly(true);
      if (state.ui.digestOpen) renderOverlayUI();
    });

  return newsDigestPromise;
}

function refreshNewsDigest() {
  newsDigestAttemptKey = null;
  const context = currentNewsDigestContext();
  if (!context.scope.items.length) {
    toast('还没有可整理的新闻', 'warn');
    return;
  }
  generateNewsDigest(context, { auto: false });
}

function resetNewsDigestAttempt() {
  newsDigestAttemptKey = null;
  if (state.view === 'news') setTimeout(maybeAutoNewsDigest, 0);
}

function openDigestFullscreen() {
  if (!state.newsDigest?.data) {
    toast('请先生成 AI 今日概览', 'warn');
    return;
  }
  if (!buildNewsDigestExportPayload()) {
    toast('请先生成最新的 AI 今日概览', 'warn');
    return;
  }
  if (state.ui.activeItem) closeReader({ silent: true });
  state.ui.modal = null;
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  setFontButtonActive();
  state.ui.digestOpen = true;
  renderSplitReader(true);
  renderOverlayUI();
}

function closeDigest() {
  if (!state.ui.digestOpen) return;
  state.ui.digestOpen = false;
  renderOverlayUI();
}

function buildNewsDigestExportPayload() {
  const digest = state.newsDigest;
  if (!digest || !digest.data) return null;
  const scope = selectScope(newsItems());
  if (digest.fingerprint !== digestFingerprint(scope)) return null;
  const itemMap = new Map(scope.items.map((item) => [item.id, item]));
  const data = digest.data || {};
  const highlights = (Array.isArray(data.highlights) ? data.highlights : []).map(
    (highlight) => {
      const item = highlight.itemId ? itemMap.get(highlight.itemId) : null;
      return {
        itemId: highlight.itemId || '',
        title: highlight.title || '',
        summary: highlight.summary || '',
        whyItMatters: highlight.whyItMatters || '',
        source: highlight.source || item?.source?.name || '',
        url: item?.link || '',
      };
    }
  );
  return {
    headline: data.headline || 'AI 今日概览',
    overview: data.overview || '',
    highlights,
    themes: Array.isArray(data.themes) ? data.themes : [],
    watch: Array.isArray(data.watch) ? data.watch : [],
    date: digest.date || '',
    scopeLabel: digest.scopeLabel || '',
    generatedAt: digest.generatedAt || '',
    provider: digest.providerLabel || '',
    model: digest.model || '',
    itemCount: digest.itemCount || 0,
  };
}

function buildNewsDigestMarkdown(payload) {
  const meta = [
    payload.date,
    payload.scopeLabel,
    payload.provider,
    payload.model,
    payload.generatedAt ? `生成于 ${formatDateTime(payload.generatedAt)}` : '',
    payload.itemCount ? `基于 ${payload.itemCount} 条候选新闻` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [`# ${payload.headline}`, '', meta, ''];
  if (payload.overview) lines.push(payload.overview, '');
  if (payload.highlights.length) {
    lines.push('## 重点信息', '');
    payload.highlights.forEach((highlight, index) => {
      lines.push(`### ${index + 1}. ${highlight.title || highlight.summary || '重点'}`);
      if (highlight.summary && highlight.summary !== highlight.title) {
        lines.push('', highlight.summary);
      }
      if (highlight.whyItMatters) {
        lines.push('', `**为什么重要：** ${highlight.whyItMatters}`);
      }
      if (highlight.source || highlight.url) {
        lines.push(
          '',
          `来源：${[highlight.source, highlight.url].filter(Boolean).join(' · ')}`
        );
      }
      lines.push('');
    });
  }
  if (payload.themes.length) {
    lines.push('## 今日主题', '', ...payload.themes.map((theme) => `- ${theme}`), '');
  }
  if (payload.watch.length) {
    lines.push(
      '## 接下来留意',
      '',
      ...payload.watch.map((item) => `- ${item}`),
      ''
    );
  }
  lines.push(
    '---',
    '',
    '由前沿雷达 Frontier Radar 导出 · AI 整理，仅供参考；事实以原始报道为准。'
  );
  return lines.join('\n');
}

async function exportNewsDigestMarkdown() {
  const payload = buildNewsDigestExportPayload();
  if (!payload) {
    toast('请先生成最新的 AI 今日概览', 'warn');
    return;
  }
  const result = await api.exportNewsDigestMarkdown(buildNewsDigestMarkdown(payload));
  if (result?.saved) toast('AI 今日概览已导出 Markdown', 'success');
  else if (result?.error) toast(`导出失败：${result.error}`, 'warn');
}

async function exportNewsDigestPDF() {
  const payload = buildNewsDigestExportPayload();
  if (!payload) {
    toast('请先生成最新的 AI 今日概览', 'warn');
    return;
  }
  if (pdfExporting) return;
  pdfExporting = true;
  try {
    const result = await api.exportNewsDigestPdf(payload);
    if (result?.saved) toast('AI 今日概览 PDF 已导出', 'success');
    else if (result?.error) toast(`PDF 导出失败：${result.error}`, 'warn');
  } catch (err) {
    toast(`PDF 导出失败：${err?.message || '未知错误'}`, 'warn');
  } finally {
    pdfExporting = false;
  }
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = null;
  if (!state.settings.autoRefresh) return;
  autoRefreshTimer = setInterval(
    () => {
      if (!document.hidden) refreshAll({ force: false, auto: true });
    },
    30 * 60 * 1000
  );
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

function applyReaderFontSize() {
  document.documentElement.style.setProperty(
    '--reader-font-size',
    `${state.ui.readerFontSize || 17}px`
  );
}

function applyReaderColumnWidth() {
  const requested = state.ui.readerColumnWidth || 760;
  const max = Math.max(520, window.innerWidth - 140);
  document.documentElement.style.setProperty(
    '--reader-column-width',
    `${Math.min(requested, max)}px`
  );
}

function updateReaderColumnWidthControls(width) {
  const value = Math.round(width);
  ['#reader-width-value', '#settings-width-value'].forEach((selector) => {
    const element = $(selector);
    if (element) element.textContent = `${value}px`;
  });
  ['#reader-width-slider', '#settings-width-slider'].forEach((selector) => {
    const slider = $(selector);
    if (slider && Number(slider.value) !== value) slider.value = String(value);
  });
}

function setReaderColumnWidth(width, options = {}) {
  const next = Math.min(1100, Math.max(520, Math.round(Number(width) || 760)));
  state.ui.readerColumnWidth = next;
  applyReaderColumnWidth();
  if (options.persist !== false) persistReaderColumnWidth();
  updateReaderColumnWidthControls(next);
}

function setReaderFontSize(size) {
  const next = Math.min(24, Math.max(14, Math.round(Number(size) || 17)));
  state.ui.readerFontSize = next;
  applyReaderFontSize();
  persistReaderFontSize();

  const fontValue = $('#font-size-value');
  if (fontValue) fontValue.textContent = `${next}px`;
  const settingsValue = $('#settings-font-value');
  if (settingsValue) settingsValue.textContent = `${next}px`;
  const preview = $('#font-preview');
  if (preview) preview.style.fontSize = `${next}px`;
  ['#font-size-slider', '#settings-font-slider'].forEach((selector) => {
    const slider = $(selector);
    if (slider && Number(slider.value) !== next) slider.value = String(next);
  });
  const down = $('[data-action="font-step"][data-delta="-1"]');
  const up = $('[data-action="font-step"][data-delta="1"]');
  if (down) down.disabled = next <= 14;
  if (up) up.disabled = next >= 24;
}

function setFontButtonActive() {
  document.querySelectorAll('[data-action="font-popover"]').forEach((button) => {
    button.classList.toggle('is-active', state.ui.fontOpen);
    button.setAttribute('aria-expanded', String(state.ui.fontOpen));
  });
}

function toggleFontPopover() {
  const button = document.querySelector('[data-action="font-popover"]');
  const rect = button?.getBoundingClientRect();
  if (rect) {
    fontPosition = {
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    };
  }
  const willOpen = !state.ui.fontOpen;
  state.ui.themeOpen = false;
  state.ui.fontOpen = willOpen;
  els.overlay.querySelector('.theme-popover')?.remove();
  els.overlay.querySelector('.font-popover')?.remove();
  if (willOpen) {
    els.overlay.insertAdjacentHTML('beforeend', renderFontPopover(fontPosition));
  }
  setFontButtonActive();
}

function closeReaderPopovers() {
  state.ui.themeOpen = false;
  state.ui.fontOpen = false;
  els.overlay.querySelector('.theme-popover')?.remove();
  els.overlay.querySelector('.font-popover')?.remove();
  setFontButtonActive();
}

function toggleThemePopover() {
  const rect = els.themeBtn.getBoundingClientRect();
  themePosition = {
    top: rect.bottom + 8,
    right: Math.max(12, window.innerWidth - rect.right),
  };
  state.ui.modal = null;
  state.ui.fontOpen = false;
  state.ui.themeOpen = !state.ui.themeOpen;
  setFontButtonActive();
  renderOverlayUI();
}

function chooseTheme(theme) {
  const wasPopover = state.ui.themeOpen;
  applyTheme(theme);
  state.ui.themeOpen = false;
  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeOption === theme);
  });
  if (wasPopover) els.overlay.querySelector('.theme-popover')?.remove();
  toast(`已切换到「${themeLabel(theme)}」主题`);
}

function themeLabel(theme) {
  const labels = {
    aurora: '极光',
    ocean: '深海',
    forest: '森林',
    ember: '余烬',
    violet: '紫罗兰',
    light: '浅色',
  };
  return labels[theme] || theme;
}

/* ------------------------------------------------------------------ */
/* Event handling                                                      */
/* ------------------------------------------------------------------ */

function bindEvents() {
  els.search.addEventListener('input', () => {
    updateSearchUI();
    runSearch();
  });

  els.search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSearch();
      els.search.blur();
    }
    if (event.key === 'Enter') {
      runSearch.flush();
    }
  });

  els.searchClear?.addEventListener('click', () => {
    clearSearch();
    els.search.focus();
  });

  els.refreshBtn.addEventListener('click', () => refreshAll({ force: true, manual: true }));
  els.themeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleThemePopover();
  });
  els.settingsBtn.addEventListener('click', () => {
    state.ui.modal = 'settings';
    state.ui.themeOpen = false;
    state.ui.fontOpen = false;
    setFontButtonActive();
    renderOverlayUI();
    if (!state.settings.hasApiKey) setTimeout(() => $('#settings-api-key')?.focus(), 60);
  });

  document.querySelectorAll('[data-win]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.win;
      if (action === 'minimize') api.window.minimize();
      else if (action === 'maximize') api.window.maximize();
      else if (action === 'close') api.window.close();
    });
  });

  api.window.isMaximized?.().then(updateMaxIcon).catch(() => {});
  api.window.onMaximizeChange?.(updateMaxIcon);

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('change', handleDocumentChange);
  document.addEventListener('input', handleDocumentInput);
  document.addEventListener('keydown', handleDocumentKeydown);
  bindSplitResizer();
  bindReaderResize();
  bindReaderWidthGrip();
  bindPen();
}

function handleDocumentClick(event) {
  if (state.ui.themeOpen || state.ui.fontOpen) {
    const insideTheme =
      event.target.closest('.theme-popover') || event.target.closest('#theme-btn');
    const insideFont =
      event.target.closest('.font-popover') ||
      event.target.closest('[data-action="font-popover"]');
    if (!insideTheme && !insideFont) {
      closeReaderPopovers();
    }
  }

  const digestBackdrop = event.target.closest('[data-digest-backdrop]');
  if (digestBackdrop && event.target === digestBackdrop) {
    event.preventDefault();
    closeDigest();
    return;
  }

  const external = event.target.closest('[data-external]');
  if (external) {
    event.preventDefault();
    const url = external.getAttribute('data-external');
    if (/^https?:\/\//i.test(url)) api.openExternal(url);
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    if (action === 'close-reader') {
      if (event.target === actionEl || actionEl.tagName === 'BUTTON') {
        event.preventDefault();
        closeReader();
      }
      return;
    }
    if (action === 'close-settings') {
      if (event.target === actionEl || actionEl.tagName === 'BUTTON') {
        event.preventDefault();
        state.ui.modal = null;
        renderOverlayUI();
      }
      return;
    }
    switch (action) {
      case 'save': {
        event.preventDefault();
        event.stopPropagation();
        const id = actionEl.dataset.id;
        if (!id) return;
        const saved = toggleSaved(id);
        document
          .querySelectorAll(`[data-action="save"][data-id="${CSS.escape(id)}"]`)
          .forEach((button) => {
            button.classList.toggle('is-active', saved);
            button.setAttribute('aria-pressed', String(saved));
            button.title = saved ? '取消收藏' : '收藏';
            button.innerHTML = icon('bookmark', { fill: saved });
          });
        if (state.view === 'saved') renderMainOnly();
        renderSidebarOnly();
        toast(saved ? '已加入收藏' : '已取消收藏');
        return;
      }
      case 'refresh':
        event.preventDefault();
        refreshAll({ force: true, manual: true });
        return;
      case 'filter':
        event.preventDefault();
        setSourceFilter(actionEl.dataset.source || 'all');
        return;
      case 'order':
        event.preventDefault();
        state.order = actionEl.dataset.order === 'time' ? 'time' : 'mixed';
        persistOrder();
        renderMainOnly();
        return;
      case 'clear-search':
        event.preventDefault();
        clearSearch();
        return;
      case 'export-notes':
        event.preventDefault();
        exportNotes();
        return;
      case 'export-pdf':
        event.preventDefault();
        exportArticlePDF();
        return;
      case 'export-notes-pdf':
        event.preventDefault();
        exportNotesPDF();
        return;
      case 'delete-note':
        event.preventDefault();
        handleDeleteNote(actionEl.dataset.id);
        return;
      case 'ai-summary':
        event.preventDefault();
        runAI();
        return;
      case 'news-digest':
        event.preventDefault();
        refreshNewsDigest();
        return;
      case 'news-digest-fullscreen':
        event.preventDefault();
        openDigestFullscreen();
        return;
      case 'close-digest':
        event.preventDefault();
        closeDigest();
        return;
      case 'news-digest-md':
        event.preventDefault();
        exportNewsDigestMarkdown();
        return;
      case 'news-digest-pdf':
        event.preventDefault();
        exportNewsDigestPDF();
        return;
      case 'save-key':
        event.preventDefault();
        saveApiKey();
        return;
      case 'clear-key':
        event.preventDefault();
        clearApiKey();
        return;
      case 'reader-layout':
        event.preventDefault();
        setReaderLayout(actionEl.dataset.layout);
        return;
      case 'font-popover':
        event.preventDefault();
        toggleFontPopover();
        return;
      case 'font-step':
        event.preventDefault();
        setReaderFontSize(
          (state.ui.readerFontSize || 17) + Number(actionEl.dataset.delta || 0)
        );
        return;
      case 'font-reset':
        event.preventDefault();
        setReaderFontSize(17);
        setReaderColumnWidth(760);
        return;
      case 'pen-toggle':
        event.preventDefault();
        togglePen();
        return;
      case 'pen-color':
        event.preventDefault();
        setPenColor(actionEl.dataset.color);
        return;
      case 'pen-width':
        event.preventDefault();
        setPenWidth(Number(actionEl.dataset.width));
        return;
      case 'pen-eraser':
        event.preventDefault();
        togglePenEraser();
        return;
      case 'pen-undo':
        event.preventDefault();
        undoInk();
        return;
      case 'pen-clear':
        event.preventDefault();
        clearInk();
        return;
      case 'ai-provider':
        event.preventDefault();
        setAiProvider(actionEl.dataset.provider);
        return;
      case 'save-ai-config':
        event.preventDefault();
        saveAiConfig();
        return;
      case 'reload-local-config':
        event.preventDefault();
        reloadLocalConfig();
        return;
      case 'proxy-mode':
        event.preventDefault();
        setProxyMode(actionEl.dataset.proxyMode);
        return;
      case 'save-proxy':
        event.preventDefault();
        saveProxyUrl();
        return;
      case 'test-network':
        event.preventDefault();
        testNetwork();
        return;
      case 'open-settings':
        event.preventDefault();
        state.ui.modal = 'settings';
        state.ui.themeOpen = false;
        renderOverlayUI();
        return;
      case 'clear-read':
        event.preventDefault();
        if (window.confirm('清除所有文章的已读状态？')) {
          clearReadHistory();
          renderAll();
          toast('阅读记录已清除');
        }
        return;
      case 'clear-cache':
        event.preventDefault();
        clearCache();
        return;
      default:
        break;
    }
  }

  const navEl = event.target.closest('[data-nav]');
  if (navEl) {
    event.preventDefault();
    setView(navEl.dataset.nav);
    return;
  }

  const newsSourceEl = event.target.closest('[data-news-source]');
  if (newsSourceEl) {
    event.preventDefault();
    setNewsSourceFilter(newsSourceEl.dataset.newsSource);
    return;
  }

  const sourceEl = event.target.closest('[data-source-filter]');
  if (sourceEl) {
    event.preventDefault();
    setSourceFilter(sourceEl.dataset.sourceFilter);
    return;
  }

  const themeEl = event.target.closest('[data-theme-option]');
  if (themeEl) {
    event.preventDefault();
    chooseTheme(themeEl.dataset.themeOption);
    return;
  }

  const openNoteEl = event.target.closest('[data-open-note]');
  if (openNoteEl) {
    event.preventDefault();
    openReader(openNoteEl.dataset.openNote);
    return;
  }

  const openIdEl = event.target.closest('[data-open-id]');
  if (openIdEl) {
    event.preventDefault();
    openReader(openIdEl.dataset.openId);
    return;
  }

  const card = event.target.closest('.feed-card');
  if (card && !event.target.closest('button, a, [data-action]')) {
    event.preventDefault();
    openReader(card.dataset.id);
  }
}

function handleDocumentChange(event) {
  if (event.target.matches('[data-direct-source]')) {
    const sourceId = event.target.dataset.directSource;
    const next = new Set(state.settings.directSources || []);
    if (event.target.checked) next.add(sourceId);
    else next.delete(sourceId);
    const directSources = [...next];
    state.settings = { ...state.settings, directSources };
    const mode = event.target
      .closest('.direct-source')
      ?.querySelector('.direct-source-mode');
    if (mode) mode.textContent = event.target.checked ? '直连' : '自动';
    api
      .saveSettings({ directSources })
      .then((settings) => {
        state.settings = settings;
        toast('来源路由已保存，点击「立即同步」生效');
      })
      .catch(() => toast('保存来源路由失败', 'warn'));
  }
  if (event.target.id === 'unread-toggle') {
    state.unreadOnly = !!event.target.checked;
    renderMainOnly();
  }
  if (event.target.id === 'auto-refresh-toggle') {
    toggleAutoRefresh(!!event.target.checked);
  }
  if (event.target.id === 'auto-news-digest-toggle') {
    toggleAutoNewsDigest(!!event.target.checked);
  }
}

function handleDocumentInput(event) {
  if (event.target.id === 'note-input') {
    handleNoteInput(event.target);
  }
  if (event.target.id === 'font-size-slider' || event.target.id === 'settings-font-slider') {
    setReaderFontSize(Number(event.target.value));
  }
  if (
    event.target.id === 'reader-width-slider' ||
    event.target.id === 'settings-width-slider'
  ) {
    setReaderColumnWidth(Number(event.target.value));
  }
}

function handleDocumentKeydown(event) {
  if (event.key === 'Escape') {
    if (state.ui.modal) {
      event.preventDefault();
      state.ui.modal = null;
      renderOverlayUI();
      return;
    }
    if (state.ui.fontOpen || state.ui.themeOpen) {
      event.preventDefault();
      closeReaderPopovers();
      return;
    }
    if (state.ui.digestOpen) {
      event.preventDefault();
      closeDigest();
      return;
    }
    if (state.ui.penActive) {
      event.preventDefault();
      setPenActive(false);
      return;
    }
    if (state.ui.activeItem) {
      event.preventDefault();
      closeReader();
      return;
    }
    if (state.query) {
      event.preventDefault();
      clearSearch();
      return;
    }
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.search.focus();
    els.search.select();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    refreshAll({ force: true, manual: true });
    return;
  }

  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'z' &&
    state.ui.penActive
  ) {
    const tag = document.activeElement?.tagName || '';
    if (!/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
      event.preventDefault();
      undoInk();
      return;
    }
  }

  const activeTag = document.activeElement?.tagName || '';
  if (!/^(INPUT|TEXTAREA|SELECT)$/.test(activeTag)) {
    const active = document.activeElement;
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      active &&
      active.tagName !== 'BUTTON' &&
      active.matches?.('[role="button"]')
    ) {
      event.preventDefault();
      active.click();
      return;
    }
    if (event.key.toLowerCase() === 'r' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      refreshAll({ force: true, manual: true });
      return;
    }
    if (
      state.ui.activeItem &&
      event.key.toLowerCase() === 'p' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      togglePen();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const card = document.activeElement?.classList?.contains('feed-card')
        ? document.activeElement
        : null;
      if (card) {
        event.preventDefault();
        openReader(card.dataset.id);
        return;
      }
    }
  }

  if (event.target.id === 'settings-api-key' && event.key === 'Enter') {
    event.preventDefault();
    saveApiKey();
  }

  if (event.target.id === 'settings-proxy-url' && event.key === 'Enter') {
    event.preventDefault();
    saveProxyUrl();
  }

  if (
    (event.target.id === 'settings-ai-model' || event.target.id === 'settings-ai-base-url') &&
    event.key === 'Enter'
  ) {
    event.preventDefault();
    saveAiConfig();
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

function initialViewFromHash() {
  const hash = location.hash.replace(/^#/, '');
  if (['overview', 'news', 'all', 'claude', 'saved', 'notes'].includes(hash)) {
    state.view = hash;
  }
}

async function boot() {
  hydrateLocal();
  applyReaderFontSize();
  applyReaderColumnWidth();
  fillStaticIcons();
  if (!api) {
    els.main.innerHTML = `<div class="view"><div class="lg-empty app-empty"><div class="lg-empty-title">预加载脚本未运行</div><p class="lg-empty-text">请通过 npm start 启动应用，而不是直接打开 index.html。</p></div></div>`;
    return;
  }
  bindEvents();
  initialViewFromHash();

  try {
    const [sources, snapshot, settings, appInfo] = await Promise.all([
      api.sources(),
      api.loadFeeds(),
      api.getSettings(),
      api.appInfo(),
    ]);
    setSources(sources);
    setFeeds(snapshot);
    state.settings = settings || state.settings;
    state.appInfo = appInfo || { version: '1.0.0', dataPath: '' };
  } catch (err) {
    state.ui.refreshError = err?.message || '初始化失败';
  }

  applyTheme(state.theme);
  renderAll();
  scheduleAutoRefresh();

  const hasItems = allItems().length > 0;
  if (!hasItems || state.stale) {
    refreshAll({ force: false, auto: true, silent: hasItems });
  }
}

boot().catch((err) => {
  console.error(err);
  if (els.main) {
    els.main.innerHTML = `<div class="view"><div class="lg-empty app-empty"><div class="lg-empty-title">应用启动失败</div><p class="lg-empty-text">${esc(
      err?.message || String(err)
    )}</p></div></div>`;
  }
});

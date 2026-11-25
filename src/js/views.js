/* HTML renderers. Every remote string goes through esc(). */

import {
  icon,
  esc,
  timeAgo,
  formatDateTime,
  todayLabel,
  syncLabel,
  clampText,
} from './ui.js';
import {
  state,
  allItems,
  claudeItems,
  filterItems,
  sourceCounts,
  unreadCount,
  recentCount,
  notesList,
  claudeNotes,
  getNote,
  getAISummary,
  sourceMap,
} from './state.js';
import {
  newsItems,
  newsSourceList,
  selectScope,
  buildHotEvents,
  keywordsOf,
  digestFingerprint,
  isLowSignal,
  isWorldItem,
} from './news.js';
import {
  GLASS_BACKGROUND_LABELS,
  GLASS_BACKGROUND_MODES,
  GLASS_PARAM_SECTIONS,
  formatGlassParam,
  normalizeGlassParams,
} from './glass.js';

const THEME_OPTIONS = [
  { id: 'aurora', label: '极光' },
  { id: 'ocean', label: '深海' },
  { id: 'forest', label: '森林' },
  { id: 'ember', label: '熔岩' },
  { id: 'violet', label: '紫罗兰' },
  { id: 'black', label: '纯黑' },
  { id: 'graphite', label: '黑灰' },
  { id: 'light', label: '明亮' },
];

const GLASS_BACKGROUNDS = GLASS_BACKGROUND_MODES.map((id) => ({
  id,
  label: GLASS_BACKGROUND_LABELS[id],
}));

const MODEL_LABELS = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'claude-fable-5-2': 'Claude Fable 5.2',
};

const GENERIC_TAGS = new Set(['summary', 'article', 'blog', 'post']);

function sourceChip(source, options = {}) {
  const id = source?.id || '';
  const isClaude = id === 'claude';
  const mark = source?.mark || String(id || 'NA').slice(0, 2).toUpperCase();
  const name = source?.name || '未知来源';
  const className = options.className ? ` ${options.className}` : '';
  return `<span class="source-chip${isClaude ? ' is-claude' : ''}${className}"><span class="source-mark${
    isClaude ? ' is-claude' : ''
  }">${esc(mark)}</span><span>${esc(name)}</span></span>`;
}

function tagsOf(item) {
  const tags = [];
  if (item.meta?.points) tags.push(`▲ ${item.meta.points}`);
  if (item.meta?.comments) tags.push(`${item.meta.comments} 评论`);
  for (const tag of item.tags || []) {
    if (!tag) continue;
    if (GENERIC_TAGS.has(String(tag).toLowerCase())) continue;
    if (!tags.some((existing) => existing.toLowerCase() === String(tag).toLowerCase())) {
      tags.push(String(tag));
    }
  }
  return tags;
}

function renderTags(item, limit = 2) {
  const tags = tagsOf(item).slice(0, limit);
  if (!tags.length) return '';
  return `<div class="tag-row">${tags
    .map((tag) => `<span class="tag" title="${esc(tag)}">${esc(clampText(tag, 22))}</span>`)
    .join('')}</div>`;
}

function renderCard(item, options = {}) {
  const read = state.read.has(item.id);
  const saved = state.saved.has(item.id);
  const hasNote = !!getNote(item.id);
  const classes = [
    'feed-card',
    options.hero ? 'feed-card--hero' : '',
    options.lead ? 'is-lead' : '',
    read ? 'is-read' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<article class="${classes}" data-id="${esc(item.id)}" role="button" tabindex="0" aria-label="${esc(
    item.title
  )}">
    <div class="feed-card-top">
      ${sourceChip(item.source)}
      ${read ? '' : '<span class="unread-dot" title="未读"></span>'}
      <span class="card-time">${esc(timeAgo(item.publishedAt))}</span>
    </div>
    <h3 class="card-title">${esc(item.title)}</h3>
    <p class="card-summary">${esc(clampText(item.summary, options.hero ? 260 : 200))}</p>
    <div class="card-bottom">
      ${renderTags(item, options.hero ? 3 : 2)}
      <div class="card-actions">
        ${hasNote ? `<span class="note-flag" title="有学习笔记">${icon('note')}</span>` : ''}
        <button class="mini-btn${saved ? ' is-active' : ''}" type="button" data-action="save" data-id="${esc(
          item.id
        )}" title="${saved ? '取消收藏' : '收藏'}" aria-pressed="${saved}">${icon('bookmark', {
          fill: saved,
        })}</button>
        <span class="card-open">阅读 ${icon('arrow-right')}</span>
      </div>
    </div>
  </article>`;
}

function sectionHead(title, hint, actionHtml = '') {
  return `<div class="section-head"><h2>${esc(title)}</h2>${
    actionHtml || (hint ? `<span class="section-hint">${esc(hint)}</span>` : '')
  }</div>`;
}

function emptyState(iconName, title, text, actionHtml = '') {
  return `<div class="lg-empty app-empty">
    <div class="lg-empty-icon">${icon(iconName)}</div>
    <div class="lg-empty-title">${esc(title)}</div>
    <p class="lg-empty-text">${esc(text)}</p>
    ${actionHtml}
  </div>`;
}

function skeletonCards(count = 6) {
  return `<div class="skeleton-grid">${Array.from(
    { length: count },
    () => '<div class="skeleton-card"></div>'
  ).join('')}</div>`;
}

function loadingView(title, subtitle) {
  return `<div class="view">
    <div class="view-head"><div>
      <div class="eyebrow"><span class="pulse-dot"></span> FRONTIER RADAR · 正在同步</div>
      <h1 class="view-title">${esc(title)}</h1>
      <p class="view-sub">${esc(subtitle)}</p>
    </div></div>
    <div class="loading-strip"><span class="lg-spinner"></span>正在从各个前沿信息源抓取最新内容，第一次同步可能需要十几秒…</div>
    ${skeletonCards(6)}
  </div>`;
}

function rankedItems(items) {
  return [...items].sort((a, b) => {
    const ua = state.read.has(a.id) ? 0 : 1;
    const ub = state.read.has(b.id) ? 0 : 1;
    if (ua !== ub) return ub - ua;
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
    return tb - ta;
  });
}

function pickDiverse(items, limit) {
  const picked = [];
  const used = new Set();
  for (const item of rankedItems(items)) {
    if (picked.length >= limit) break;
    if (used.has(item.sourceId)) continue;
    picked.push(item);
    used.add(item.sourceId);
  }
  for (const item of rankedItems(items)) {
    if (picked.length >= limit) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

function pickHomeLead(items) {
  const ranked = rankedItems(items);
  return (
    ranked.find(
      (item) =>
        !isLowSignal(item) &&
        item.summary &&
        item.summary.length >= 80
    ) || ranked[0]
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

export function renderSidebar() {
  const items = allItems();
  const counts = sourceCounts();
  const claude = claudeItems();
  const notes = notesList();
  const savedCount = items.filter((item) => state.saved.has(item.id)).length;
  const unread = unreadCount(items);
  const claudeError = state.feeds.claude?.error;
  const errors = state.sources.filter((source) => state.feeds[source.id]?.error);
  const stale = state.stale || !state.updatedAt;
  const syncDotClass = errors.length ? 'is-error' : stale ? 'is-stale' : '';
  const newsToday = selectScope(newsItems()).items.length;

  const navItems = [
    { view: 'overview', label: '概览', iconName: 'overview', count: null },
    {
      view: 'news',
      label: '今日热点',
      iconName: 'flame',
      count: newsToday || null,
    },
    { view: 'all', label: '全部资讯', iconName: 'rss', count: items.length },
    {
      view: 'claude',
      label: 'Claude 专区',
      iconName: 'sparkle',
      count: claude.length,
      error: claudeError,
    },
    { view: 'saved', label: '收藏夹', iconName: 'bookmark', count: savedCount || null },
    { view: 'notes', label: '学习笔记', iconName: 'note', count: notes.length || null },
  ];

  const mainSources = state.sources.filter(
    (source) => source.id !== 'claude' && !source.newsSection
  );
  const newsSources = state.sources.filter((source) => source.newsSection);

  const primaryNav = navItems.slice(0, 4);
  const personalNav = navItems.slice(4);

  const renderNavItem = (entry) => {
    const active =
      state.view === entry.view && (entry.view !== 'all' || state.sourceFilter === 'all');
    return `<button class="nav-item${active ? ' is-active' : ''}" type="button" data-nav="${
      entry.view
    }" title="${esc(entry.label)}">
      <span class="nav-icon">${icon(entry.iconName)}</span>
      <span class="nav-label">${esc(entry.label)}</span>
      ${entry.error ? `<span class="source-error-dot" title="${esc(entry.error)}"></span>` : ''}
      ${entry.count != null ? `<span class="nav-count">${entry.count}</span>` : ''}
    </button>`;
  };

  const renderSourceRow = (source, active, attr) => {
    const error = state.feeds[source.id]?.error;
    return `<button class="source-row${active ? ' is-active' : ''}" type="button" ${attr}="${esc(
      source.id
    )}" title="${esc(`${source.title} · ${source.subtitle}`)}">
      <span class="source-mark">${esc(source.mark)}</span>
      <span class="source-name">${esc(source.name)}</span>
      ${error ? `<span class="source-error-dot" title="${esc(error)}"></span>` : ''}
      <span class="source-count">${counts[source.id] || 0}</span>
    </button>`;
  };

  return `
    <div class="side-section side-section--nav">
      <div class="side-label"><span>浏览</span></div>
      <nav class="side-nav" aria-label="主要导航">
        ${primaryNav.map(renderNavItem).join('')}
      </nav>
    </div>

    <div class="side-section side-section--nav">
      <div class="side-label"><span>我的</span></div>
      <nav class="side-nav" aria-label="收藏与笔记">
        ${personalNav.map(renderNavItem).join('')}
      </nav>
    </div>

    <div class="side-section">
      <div class="side-label"><span>资讯源</span><span>${mainSources.length}</span></div>
      <div class="side-list">
        ${mainSources
          .map((source) =>
            renderSourceRow(
              source,
              state.view === 'all' && state.sourceFilter === source.id,
              'data-source-filter'
            )
          )
          .join('')}
      </div>
    </div>

    ${
      newsSources.length
        ? `<div class="side-section">
            <div class="side-label"><span>新闻源</span><span>${newsSources.length}</span></div>
            <div class="side-list">
              ${newsSources
                .map((source) =>
                  renderSourceRow(
                    source,
                    state.view === 'news' && state.sourceFilter === source.id,
                    'data-news-source'
                  )
                )
                .join('')}
            </div>
          </div>`
        : ''
    }

    <div class="side-footer">
      <div class="side-footer-head">
        <span class="sync-dot ${syncDotClass}"></span>
        <span class="side-footer-title">${esc(syncLabel(state.updatedAt))}</span>
      </div>
      <div class="side-footer-meta">${unread ? `${unread} 条未读 · ` : ''}${
        state.settings.autoRefresh ? '每 30 分钟自动同步' : '手动同步'
      }</div>
      <div class="side-footer-meta is-faint">本地缓存 · 离线可读 · v${esc(
        state.appInfo.version || '1.0.0'
      )}</div>
    </div>
  `;
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

function proxyRouteLabel(settings) {
  const resolved = String(settings.proxyStatus?.resolved || '');
  const match = resolved.match(/(PROXY|HTTPS?|SOCKS\d?)\s+([^;]+)/i);
  if (match) {
    const kind = match[1].toUpperCase();
    return `${kind === 'PROXY' ? '代理' : kind} ${match[2].trim()}`;
  }
  if (/DIRECT/i.test(resolved)) return '直连（系统未配置代理）';
  const mode = settings.proxyMode || 'system';
  if (mode === 'direct') return '直连';
  if (mode === 'manual') return `手动代理 ${settings.proxyUrl || '（未填写）'}`;
  return '跟随系统代理';
}

function proxyFailureHint(settings) {
  const mode = settings.proxyMode || 'system';
  const resolved = String(settings.proxyStatus?.resolved || '');
  const match = resolved.match(/(PROXY|HTTPS?|SOCKS\d?)\s+([^;]+)/i);
  const proxy = match ? match[2].trim() : '';

  if (mode === 'manual') {
    return proxy
      ? `当前手动代理为 ${proxy}。请确认代理程序已启动、端口正确，或切换为「跟随系统」/「直连」后重试。`
      : '当前使用手动代理但地址为空或无效。请填写本机代理端口，或切换为「跟随系统」/「直连」后重试。';
  }
  if (mode === 'direct') {
    return '当前为直连。如果所在网络无法直接访问这些站点，请开启系统代理，或在设置中切换到「手动代理」并填写本机代理端口。';
  }
  if (proxy) {
    return `系统代理为 ${proxy}。请确认代理程序正在运行；也可在设置中手动填写该地址，或切换为「直连」后测试。`;
  }
  return '系统未配置可用代理。若访问这些站点需要代理，请先在 Windows/macOS 系统或本应用设置中配置。';
}

function renderOverview() {
  const items = allItems();
  const errors = state.sources.filter((source) => state.feeds[source.id]?.error);
  const errorNames = errors.map((source) => source.name).join('、');

  if (!items.length) {
    if (state.ui.refreshing) {
      return loadingView(
        '正在捕获第一批信号…',
        `首次启动会同时抓取 ${state.sources.length || 15} 个信息源。`
      );
    }
    if (errors.length) {
      const routeLabel = proxyRouteLabel(state.settings);
      const failureHint = proxyFailureHint(state.settings);
      return `<div class="view">
        <div class="view-head">
          <div>
            <div class="eyebrow"><span class="pulse-dot"></span> NETWORK · 同步失败</div>
            <h1 class="view-title">抓取失败</h1>
            <p class="view-sub">${errors.length} 个来源都未能同步。当前网络：${esc(
              routeLabel
            )}。访问 claude.dev、OpenAI 等站点通常需要代理，请检查系统代理是否开启，或在「网络与代理」中手动指定。</p>
          </div>
          <div class="head-actions">
            <button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
              'refresh'
            )} 重新抓取</button>
            <button class="lg-btn" type="button" data-action="open-settings">${icon(
              'globe'
            )} 网络与代理</button>
          </div>
        </div>
        <div class="lg-empty app-empty">
          <div class="lg-empty-icon">${icon('globe')}</div>
          <div class="lg-empty-title">0 个来源成功同步</div>
          <p class="lg-empty-text">${esc(errorNames)}</p>
          <p class="lg-empty-text">${esc(
            failureHint
          )} 修改后可点击「测试 claude.dev」确认连通性。</p>
        </div>
      </div>`;
    }
    return `<div class="view">
      ${emptyState(
        'rss',
        '还没有抓到内容',
        '点击刷新，从 claude.dev、OpenAI、DeepMind、arXiv、Hacker News 等来源抓取最新更新。',
        `<button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
          'refresh'
        )} 开始抓取</button>`
      )}
    </div>`;
  }

  const claude = claudeItems();
  const notes = notesList();
  const recent = recentCount(24);
  const unread = unreadCount(items);
  const activeSources = state.sources.filter((source) => (state.feeds[source.id]?.items || []).length).length;
  const focusItems = items.filter((item) => !isLowSignal(item) && !isWorldItem(item));
  const lead = pickHomeLead(focusItems.length ? focusItems : items);
  const highlights = pickDiverse(focusItems.length ? focusItems : items, 3);
  const claudePreview = rankedItems(claude).slice(0, 2);

  const pulseRows = state.sources
    .map((source) => {
      const entry = state.feeds[source.id];
      const latest = (entry?.items || [])[0];
      if (!latest) {
        return `<button class="pulse-row" type="button" data-source-filter="${esc(source.id)}">
          <span class="source-mark">${esc(source.mark)}</span>
          <span class="pulse-name">${esc(source.name)}</span>
          <span class="pulse-title is-muted">${
            entry?.error ? `同步失败：${esc(entry.error)}` : '暂无更新，点击刷新'
          }</span>
          <span class="pulse-time">${entry?.error ? '异常' : '—'}</span>
        </button>`;
      }
      return `<button class="pulse-row" type="button" data-source-filter="${esc(source.id)}">
        <span class="source-mark">${esc(source.mark)}</span>
        <span class="pulse-name">${esc(source.name)}</span>
        <span class="pulse-title">${esc(latest.title)}</span>
        <span class="pulse-time">${esc(timeAgo(latest.publishedAt))}</span>
      </button>`;
    })
    .join('');

  return `<div class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow"><span class="pulse-dot"></span> FRONTIER RADAR · ${esc(todayLabel())}</div>
        <h1 class="view-title">今天，<span class="gradient-text">前沿</span>在发生什么？</h1>
        <p class="view-sub">已从 ${activeSources} 个信息源捕获 ${items.length} 条更新${
    unread ? `，其中 ${unread} 条尚未阅读` : ''
  }。挑值得花时间的信号，而不是刷完所有信息。</p>
      </div>
      <div class="head-actions">
        <button class="lg-btn lg-btn--primary" type="button" data-action="refresh" ${
          state.ui.refreshing ? 'disabled' : ''
        }>${icon('refresh')} ${state.ui.refreshing ? '同步中…' : '刷新资讯'}</button>
      </div>
    </div>

    ${
      errors.length
        ? `<div class="notice">${icon('alert')}<span>${esc(
            errorNames
          )} 暂时无法同步，请稍后重试。</span><button type="button" data-action="refresh">重试</button></div>`
        : ''
    }

    <section class="hero-panel">
      <div class="brief-main">
        <div class="brief-kicker">${sourceChip(lead.source)}<span>今日简报</span></div>
        <h2 class="brief-title" data-open-id="${esc(lead.id)}">${esc(lead.title)}</h2>
        <p class="brief-text">${esc(clampText(lead.summary, 300))}</p>
        <div class="brief-foot">
          <span>${esc(timeAgo(lead.publishedAt))}${lead.author ? ` · ${esc(clampText(lead.author, 36))}` : ''}</span>
          <span class="brief-actions">
            <button class="lg-btn lg-btn--sm" type="button" data-open-id="${esc(lead.id)}">开始阅读</button>
            <button class="lg-btn lg-btn--sm" type="button" data-action="save" data-id="${esc(
              lead.id
            )}">${icon('bookmark', { fill: state.saved.has(lead.id) })} ${
    state.saved.has(lead.id) ? '已收藏' : '收藏'
  }</button>
          </span>
        </div>
      </div>
      <div class="brief-stats" aria-label="本地学习概况">
        <div class="brief-stat"><strong>${items.length}</strong><span>条资讯</span></div>
        <div class="brief-stat"><strong>${recent}</strong><span>近 24 小时</span></div>
        <div class="brief-stat"><strong>${claude.length}</strong><span>Claude 文章</span></div>
        <div class="brief-stat"><strong>${notes.length}</strong><span>篇学习笔记</span></div>
      </div>
    </section>

    ${sectionHead('今日焦点', '按新鲜度与来源多样性挑选', `<button class="text-link" type="button" data-nav="all">查看全部 →</button>`)}
    <div class="feed-grid feed-grid--hero">
      ${highlights.map((item, index) => renderCard(item, { hero: true, lead: index === 0 })).join('')}
    </div>

    ${sectionHead(
      'Claude 专区 · 最新',
      '',
      `<button class="text-link" type="button" data-nav="claude">进入专区 →</button>`
    )}
    ${
      claudePreview.length
        ? `<div class="feed-grid feed-grid--compact">${claudePreview
            .map((item) => renderCard(item))
            .join('')}</div>`
        : emptyState('sparkle', '专区还在等待同步', '刷新后即可看到 claude.dev 的最新文章与学习路线。')
    }

    ${sectionHead('来源脉搏', '每个信息源的最新一条更新')}
    <div class="pulse-list">${pulseRows}</div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Feed / saved views                                                  */
/* ------------------------------------------------------------------ */

function renderFeedView() {
  const isSaved = state.view === 'saved';
  const isSource = !isSaved && state.sourceFilter !== 'all';
  const source = isSource ? sourceMap()[state.sourceFilter] : null;
  const base = isSaved ? allItems().filter((item) => state.saved.has(item.id)) : allItems();
  const items = filterItems();
  const counts = sourceCounts();
  const claudeCount = (state.feeds.claude?.items || []).length;

  const title = isSaved ? '收藏夹' : isSource ? source?.title || '信息源' : '全部资讯';
  const subtitle = isSaved
    ? '把值得反复读的信号留在这里。收藏与笔记都只保存在本机。'
    : isSource
    ? `${source?.subtitle || ''} · 来自 ${source?.name || ''}`
    : `把 ${state.sources.length} 个技术与新闻源汇成一条信息流，可在「混合」与「最新」之间切换，支持搜索与只看未读。`;

  const eyebrow = isSaved ? 'LIBRARY · 收藏' : isSource ? `SOURCE · ${source?.name || ''}` : 'FEED · 全部来源';

  const chips = [];
  chips.push(`<button class="chip${state.sourceFilter === 'all' ? ' is-active' : ''}" type="button" data-action="filter" data-source="all">全部 <span class="chip-count">${base.length}</span></button>`);
  for (const entry of state.sources) {
    if (entry.id === 'claude' && state.view === 'saved') {
      // still show if saved Claude items exist
    }
    const count = base.filter((item) => item.sourceId === entry.id).length;
    if (!count) continue;
    chips.push(`<button class="chip${
      state.sourceFilter === entry.id ? ' is-active' : ''
    }" type="button" data-action="filter" data-source="${esc(entry.id)}">${esc(
      entry.name
    )} <span class="chip-count">${count}</span></button>`);
  }

  const errors = state.sources.filter((entry) => state.feeds[entry.id]?.error);
  const errorNames = errors.map((entry) => entry.name).join('、');
  const showOrder = state.view === 'all' && state.sourceFilter === 'all';

  return `<div class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow"><span class="pulse-dot"></span> ${esc(eyebrow)}</div>
        <h1 class="view-title">${esc(title)}</h1>
        <p class="view-sub">${esc(subtitle)}</p>
      </div>
      <div class="head-actions">
        ${
          isSaved
            ? `<button class="lg-btn" type="button" data-nav="notes">${icon('note')} 查看笔记</button>`
            : `<button class="lg-btn lg-btn--primary" type="button" data-action="refresh" ${
                state.ui.refreshing ? 'disabled' : ''
              }>${icon('refresh')} ${state.ui.refreshing ? '同步中…' : '刷新'}</button>`
        }
      </div>
    </div>

    ${
      errors.length
        ? `<div class="notice">${icon('alert')}<span>${esc(
            errorNames
          )} 暂时无法同步，请稍后重试。</span><button type="button" data-action="refresh">重试</button></div>`
        : ''
    }

    <div class="feed-toolbar">
      <div class="chip-row">${chips.join('')}</div>
      <div class="toolbar-right">
        ${
          showOrder
            ? `<div class="order-toggle" role="group" aria-label="排序方式">
                <button class="order-btn${state.order === 'mixed' ? ' is-active' : ''}" type="button" data-action="order" data-order="mixed" title="每个来源轮流出现，兼顾新鲜度">混合</button>
                <button class="order-btn${state.order === 'time' ? ' is-active' : ''}" type="button" data-action="order" data-order="time" title="严格按发布时间排序">最新</button>
              </div>`
            : ''
        }
        <label class="check-toggle"><input type="checkbox" id="unread-toggle" ${
          state.unreadOnly ? 'checked' : ''
        } /> 只看未读</label>
      </div>
    </div>

    <div class="result-line">
      <span>${
        state.query
          ? `搜索 “${esc(clampText(state.query, 40))}” · ${items.length} 条结果`
          : showOrder && state.order === 'mixed'
          ? `共 ${items.length} 条 · 混合排序（兼顾来源与时间）`
          : `共 ${items.length} 条 · 按发布时间排序`
      }</span>
      <span class="live-hint">${icon('clock')} ${esc(syncLabel(state.updatedAt))}</span>
    </div>

    ${
      state.ui.refreshing && !base.length
        ? `${skeletonCards(6)}`
        : items.length
        ? `<div class="feed-grid">${items.map((item) => renderCard(item)).join('')}</div>`
        : emptyState(
            isSaved ? 'bookmark' : 'search',
            isSaved ? '收藏夹还是空的' : '没有匹配的内容',
            isSaved
              ? '在资讯卡片上点击书签按钮，就会收藏到这里。'
              : state.query
              ? '换一个关键词，或清除搜索后再看看。'
              : '当前筛选条件下没有内容，试试刷新或切换来源。',
            isSaved
              ? `<button class="lg-btn" type="button" data-nav="all">去浏览资讯</button>`
              : `<button class="lg-btn" type="button" data-action="clear-search">清除搜索</button>`
          )
    }
  </div>`;
}

/* ------------------------------------------------------------------ */
/* News view                                                           */
/* ------------------------------------------------------------------ */

function renderNewsSourceMarks(sources, max = 4) {
  const list = (sources || []).slice(0, max);
  const marks = list
    .map(
      (source) =>
        `<span class="news-event-source" title="${esc(source.title || source.name)}">${esc(
          source.mark || source.name
        )}</span>`
    )
    .join('');
  const more =
    (sources || []).length > max
      ? `<span class="news-event-source is-more">+${sources.length - max}</span>`
      : '';
  return `<span class="news-event-sources">${marks}${more}</span>`;
}

function renderNewsRow(item) {
  const read = state.read.has(item.id);
  const heat = Number(item.meta?.points) || 0;
  const meta = [item.source?.name || '', heat ? `▲ ${heat}` : ''].filter(Boolean).join(' · ');
  return `<article class="news-row${read ? ' is-read' : ''}" data-open-id="${esc(
    item.id
  )}" role="button" tabindex="0" aria-label="${esc(item.title)}">
    <span class="news-row-time" title="${esc(formatDateTime(item.publishedAt))}">${esc(
      timeAgo(item.publishedAt)
    )}</span>
    <span class="source-mark news-row-mark" title="${esc(item.source?.title || '')}">${esc(
      item.source?.mark || ''
    )}</span>
    <span class="news-row-main">
      <span class="news-row-title" title="${esc(item.title)}">${esc(item.title)}</span>
      <span class="news-row-meta">${esc(meta)}</span>
    </span>
    <span class="news-row-open">${icon('arrow-right')}</span>
  </article>`;
}

function renderNewsEventCard(event, rank) {
  return `<article class="news-event-card" data-open-id="${esc(
    event.id
  )}" role="button" tabindex="0" aria-label="${esc(event.title)}">
    <div class="news-event-top">
      <span class="news-event-rank">${String(rank).padStart(2, '0')}</span>
      <span class="news-event-coverage">${
        event.coverage > 1 ? `${event.coverage} 家媒体` : '热门报道'
      }</span>
      <span class="news-event-time">${esc(timeAgo(event.newestAt))}</span>
    </div>
    <h3 class="news-event-title">${esc(event.title)}</h3>
    <p class="news-event-summary">${esc(clampText(event.summary || '', 150))}</p>
    <div class="news-event-foot">
      ${renderNewsSourceMarks(event.sources)}
      <span class="news-event-open">阅读 ${icon('arrow-right')}</span>
    </div>
  </article>`;
}

function renderNewsHero(event, stats, keywords, scopeLabel) {
  return `<section class="news-hero">
    <div class="news-hero-main">
      <div class="news-kicker">
        <span class="news-live"><span class="pulse-dot"></span> LIVE BRIEF</span>
        <span>${esc(todayLabel())}</span>
      </div>
      <div class="news-tag">${event ? '今日头条' : '今日热点'}</div>
      ${
        event
          ? `<h2 class="news-headline" data-open-id="${esc(
              event.id
            )}" role="button" tabindex="0">${esc(event.title)}</h2>
             <p class="news-deck">${esc(clampText(event.summary || '', 300))}</p>
             <div class="news-byline">
               ${event.source ? sourceChip(event.source) : ''}
               <span class="news-byline-dot"></span>
               <span>${event.coverage > 1 ? `${event.coverage} 家媒体报道` : '热门报道'}</span>
               <span class="news-byline-dot"></span>
               <span>${esc(timeAgo(event.newestAt))}</span>
               <button class="lg-btn lg-btn--sm" type="button" data-open-id="${esc(
                 event.id
               )}">${icon('book')} 阅读全文</button>
             </div>`
          : `<h2 class="news-headline">正在汇聚今日热点</h2>
             <p class="news-deck">刷新后会从 ${stats.sourceTotal} 个新闻源抓取今天的世界与科技报道。</p>`
      }
    </div>
    <aside class="news-stats">
      <div class="news-stat"><strong>${stats.items}</strong><span>${esc(scopeLabel)}新闻</span></div>
      <div class="news-stat"><strong>${stats.sources}</strong><span>新闻源</span></div>
      <div class="news-stat"><strong>${stats.events}</strong><span>多源热点</span></div>
      <div class="news-stat"><strong>${stats.world}</strong><span>世界要闻</span></div>
      <div class="news-keyword-block">
        <span class="news-stat-label">今日关键词</span>
        <div class="news-keywords">${
          keywords.length
            ? keywords.map((word) => `<span class="news-keyword">#${esc(word)}</span>`).join('')
            : '<span class="news-keyword is-muted">正在提取</span>'
        }</div>
      </div>
    </aside>
  </section>`;
}

function renderNewsDigest({ digest, loading, error, autoEnabled, validIds }) {
  const configError = ['no_key', 'no_base_url', 'local_config_missing'].includes(
    error?.code
  );

  if (!digest && loading) {
    return `<section class="news-digest news-digest--loading" aria-live="polite">
      <div class="news-digest-head">
        <span class="news-digest-badge">${icon('sparkle')} AI 今日概览</span>
        <span class="news-digest-meta">AI 正在整理</span>
      </div>
      <div class="news-digest-loading"><span class="lg-spinner"></span>正在阅读今日新闻、合并重复报道并提炼重点…</div>
      <div class="news-digest-foot">
        <span>会把当天新闻的标题与摘要发送给当前 AI 服务 · 仅供参考</span>
      </div>
    </section>`;
  }

  if (!digest && error) {
    return `<section class="news-digest news-digest--empty">
      <div class="news-digest-head">
        <span class="news-digest-badge">${icon('sparkle')} AI 今日概览</span>
        <span class="news-digest-meta">${configError ? '需要配置 AI' : '整理失败'}</span>
      </div>
      <h2 class="news-digest-title">${
        configError ? '配置 AI 后，自动整理今日重点' : '今天的 AI 概览暂时没有生成'
      }</h2>
      <p class="news-digest-overview">${esc(
        configError
          ? `${error.message}。配置后打开「今日热点」会自动把当天标题与摘要整理成重点概览。`
          : error.message
      )}</p>
      <div class="news-digest-foot">
        <span>AI 概览只基于已抓取的新闻标题与摘要，仅供参考</span>
        <span class="news-digest-actions">
          ${
            configError
              ? `<button class="lg-btn lg-btn--sm lg-btn--primary" type="button" data-action="open-settings">${icon(
                  'settings'
                )} 去设置</button>`
              : ''
          }
          <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest">${icon(
            'refresh'
          )} 重试</button>
        </span>
      </div>
    </section>`;
  }

  if (!digest) {
    return `<section class="news-digest news-digest--empty">
      <div class="news-digest-head">
        <span class="news-digest-badge">${icon('sparkle')} AI 今日概览</span>
        <span class="news-digest-meta">${autoEnabled ? '等待自动整理' : '自动整理已关闭'}</span>
      </div>
      <h2 class="news-digest-title">让 AI 用一分钟告诉你今天发生了什么</h2>
      <p class="news-digest-overview">${
        autoEnabled
          ? '正在准备今日新闻候选，稍后会自动生成重点概览。'
          : '你不希望自动发送新闻标题与摘要时可以保持关闭，也可以随时手动生成一次。'
      }</p>
      <div class="news-digest-foot">
        <span>会把当天新闻的标题与摘要发送给当前 AI 服务 · 仅供参考</span>
        <span class="news-digest-actions">
          <button class="lg-btn lg-btn--sm lg-btn--primary" type="button" data-action="news-digest">${icon(
            'sparkle'
          )} 生成今日概览</button>
        </span>
      </div>
    </section>`;
  }

  const data = digest.data || {};
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const themes = Array.isArray(data.themes) ? data.themes : [];
  const watch = Array.isArray(data.watch) ? data.watch : [];
  const provider = [digest.providerLabel, modelLabel(digest.model)].filter(Boolean).join(' · ');

  return `<section class="news-digest" aria-live="polite">
    <div class="news-digest-head">
      <span class="news-digest-badge">${icon('sparkle')} AI 今日概览</span>
      <span class="news-digest-head-right">
        <span class="news-digest-meta">${esc(provider)} · ${esc(timeAgo(digest.generatedAt))}</span>
        <button class="lg-icon-btn news-digest-expand" type="button" data-action="news-digest-fullscreen" title="全屏阅读" aria-label="全屏阅读">${icon(
          'layout-fullscreen'
        )}</button>
      </span>
    </div>
    <h2 class="news-digest-title">${esc(data.headline || '今日重点概览')}</h2>
    ${data.overview ? `<p class="news-digest-overview">${esc(data.overview)}</p>` : ''}
    ${
      highlights.length
        ? `<div class="news-digest-highlights">${highlights
            .map((highlight, index) => {
              const linked = highlight.itemId && validIds.has(highlight.itemId);
              return `<article class="news-digest-item${linked ? ' is-link' : ''}"${
                linked
                  ? ` data-open-id="${esc(highlight.itemId)}" role="button" tabindex="0"`
                  : ''
              }>
                <span class="news-digest-rank">${String(index + 1).padStart(2, '0')}</span>
                <div class="news-digest-body">
                  <h3>${esc(highlight.title || highlight.summary || '')}</h3>
                  ${
                    highlight.title && highlight.summary
                      ? `<p>${esc(highlight.summary)}</p>`
                      : ''
                  }
                  ${
                    highlight.whyItMatters
                      ? `<p class="news-digest-why">${esc(highlight.whyItMatters)}</p>`
                      : ''
                  }
                  ${
                    highlight.source
                      ? `<span class="news-digest-source">${esc(highlight.source)}</span>`
                      : ''
                  }
                </div>
              </article>`;
            })
            .join('')}</div>`
        : ''
    }
    ${
      themes.length
        ? `<div class="news-digest-themes">${themes
            .map((theme) => `<span class="news-digest-theme">#${esc(theme)}</span>`)
            .join('')}</div>`
        : ''
    }
    ${
      watch.length
        ? `<div class="news-digest-watch">
            <span class="news-digest-watch-label">接下来留意</span>
            <ul>${watch.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
          </div>`
        : ''
    }
    ${
      error || loading
        ? `<div class="news-digest-status">${
            loading
              ? '<span class="lg-spinner"></span>正在根据最新新闻重新整理…'
              : esc(error?.message || '')
          }</div>`
        : ''
    }
    <div class="news-digest-foot">
      <span>基于 ${digest.itemCount || 0} 条${esc(
        digest.scopeLabel || '今日'
      )}候选新闻 · AI 整理，仅供参考</span>
      <span class="news-digest-actions">
        <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest-fullscreen" title="全屏阅读 AI 今日概览">${icon(
          'layout-fullscreen'
        )} 全屏阅读</button>
        <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest-md" title="导出 Markdown 文档">${icon(
          'download'
        )} Markdown</button>
        <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest-pdf" title="导出 PDF 文档">${icon(
          'download'
        )} PDF</button>
        <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest" ${
          loading ? 'disabled' : ''
        }>${icon('refresh')} 重新整理</button>
      </span>
    </div>
  </section>`;
}

function renderDigestReaderBody(digest, validIds) {
  const data = digest.data || {};
  const highlights = Array.isArray(data.highlights) ? data.highlights : [];
  const themes = Array.isArray(data.themes) ? data.themes : [];
  const watch = Array.isArray(data.watch) ? data.watch : [];
  const provider = [digest.providerLabel, modelLabel(digest.model)].filter(Boolean).join(' · ');
  const meta = [
    digest.date,
    digest.scopeLabel ? `${digest.scopeLabel}新闻` : '',
    provider,
    digest.generatedAt ? formatDateTime(digest.generatedAt) : '',
    digest.itemCount ? `基于 ${digest.itemCount} 条候选` : '',
  ]
    .filter(Boolean)
    .map((part) => esc(part))
    .join('<span class="dot"></span>');

  return `<div class="digest-reader-kicker">${icon('sparkle')} AI 今日概览</div>
    <h1 class="digest-reader-title">${esc(data.headline || 'AI 今日概览')}</h1>
    <div class="digest-reader-meta">${meta}</div>
    ${data.overview ? `<p class="digest-reader-overview">${esc(data.overview)}</p>` : ''}
    ${
      highlights.length
        ? `<h2 class="digest-reader-section">重点信息</h2>
           <div class="digest-reader-list">${highlights
             .map((highlight, index) => {
               const linked = highlight.itemId && validIds.has(highlight.itemId);
               const title = highlight.title || highlight.summary || '重点';
               const summary = highlight.summary || '';
               return `<section class="digest-reader-item${
                 linked ? ' is-link' : ''
               }"${linked ? ` data-open-id="${esc(highlight.itemId)}" role="button" tabindex="0"` : ''}>
                 <div class="digest-reader-num">${String(index + 1).padStart(2, '0')}</div>
                 <div class="digest-reader-item-body">
                   <h3>${esc(title)}</h3>
                   ${summary && summary !== title ? `<p>${esc(summary)}</p>` : ''}
                   ${
                     highlight.whyItMatters
                       ? `<p class="digest-reader-why">${esc(highlight.whyItMatters)}</p>`
                       : ''
                   }
                   ${
                     highlight.source || linked
                       ? `<div class="digest-reader-source">${esc(
                           highlight.source || ''
                         )}${linked ? ' · 打开原文 →' : ''}</div>`
                       : ''
                   }
                 </div>
               </section>`;
             })
             .join('')}</div>`
        : ''
    }
    ${
      themes.length
        ? `<h2 class="digest-reader-section">今日主题</h2>
           <div class="digest-reader-themes">${themes
             .map((theme) => `<span>#${esc(theme)}</span>`)
             .join('')}</div>`
        : ''
    }
    ${
      watch.length
        ? `<h2 class="digest-reader-section">接下来留意</h2>
           <ul class="digest-reader-watch">${watch
             .map((item) => `<li>${esc(item)}</li>`)
             .join('')}</ul>`
        : ''
    }
    <footer class="digest-reader-footer">
      AI 整理，仅供参考；事实以原始报道为准。${provider ? ` · ${esc(provider)}` : ''}
    </footer>`;
}

export function renderDigestOverlay() {
  const digest = state.newsDigest;
  if (!digest || !digest.data) return '';
  const scope = selectScope(newsItems());
  const validIds = new Set(scope.items.map((item) => item.id));
  const provider = [digest.providerLabel, modelLabel(digest.model)].filter(Boolean).join(' · ');
  return `<div class="reader-overlay reader-overlay--fullscreen digest-overlay" data-digest-backdrop>
    <aside class="reader-panel digest-reader-panel" role="dialog" aria-modal="true" aria-label="AI 今日概览">
      <header class="reader-head">
        <div class="reader-head-left">
          <span class="news-digest-badge">${icon('sparkle')} AI 今日概览</span>
          <span class="card-time">${esc(provider)} · ${esc(timeAgo(digest.generatedAt))}</span>
        </div>
        <div class="reader-head-actions">
          <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest-md">${icon(
            'download'
          )} Markdown</button>
          <button class="lg-btn lg-btn--sm" type="button" data-action="news-digest-pdf">${icon(
            'download'
          )} PDF</button>
          <button class="lg-icon-btn" type="button" data-action="close-digest" title="关闭 (Esc)" aria-label="关闭">${icon(
            'close'
          )}</button>
        </div>
      </header>
      <div class="reader-scroll lg-scroll">
        <article class="digest-reader-content">${renderDigestReaderBody(
          digest,
          validIds
        )}</article>
      </div>
    </aside>
  </div>`;
}

function renderNewsChips(sources, scopeItems, filterSource) {
  const counts = new Map();
  for (const item of scopeItems) {
    counts.set(item.sourceId, (counts.get(item.sourceId) || 0) + 1);
  }
  const chips = [
    `<button class="chip${!filterSource ? ' is-active' : ''}" type="button" data-news-source="all">全部 <span class="chip-count">${scopeItems.length}</span></button>`,
  ];
  for (const source of sources) {
    const count = counts.get(source.id) || 0;
    if (!count && filterSource?.id !== source.id) continue;
    chips.push(
      `<button class="chip${filterSource?.id === source.id ? ' is-active' : ''}" type="button" data-news-source="${esc(
        source.id
      )}">${esc(source.name)} <span class="chip-count">${count}</span></button>`
    );
  }
  return `<div class="feed-toolbar news-toolbar">
    <div class="chip-row">${chips.join('')}</div>
    <div class="toolbar-right"><span class="section-hint">${icon('newspaper')} 按新闻源筛选</span></div>
  </div>`;
}

function renderNewsSearchView(query, items) {
  const results = items.filter((item) =>
    `${item.title} ${item.summary} ${(item.tags || []).join(' ')} ${item.source?.name || ''}`
      .toLowerCase()
      .includes(query)
  );
  return `<div class="view news-view">
    <div class="view-head">
      <div>
        <div class="eyebrow"><span class="pulse-dot"></span> NEWSROOM · 搜索</div>
        <h1 class="view-title">新闻搜索</h1>
        <p class="view-sub">在 ${items.length} 条已缓存的新闻中搜索标题、摘要与来源。</p>
      </div>
      <div class="head-actions">
        <button class="lg-btn" type="button" data-action="clear-search">${icon('close')} 清除搜索</button>
        <button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
          'refresh'
        )} 刷新新闻</button>
      </div>
    </div>
    <div class="result-line">
      <span>搜索 “${esc(clampText(state.query, 40))}” · ${results.length} 条结果</span>
      <span class="live-hint">${icon('clock')} ${esc(syncLabel(state.updatedAt))}</span>
    </div>
    ${
      results.length
        ? `<div class="news-stream">${results.slice(0, 120).map(renderNewsRow).join('')}</div>`
        : emptyState(
            'search',
            '没有匹配的新闻',
            '换一个关键词，或清除搜索后再看看。',
            `<button class="lg-btn" type="button" data-action="clear-search">清除搜索</button>`
          )
    }
  </div>`;
}

function renderNewsView() {
  const all = newsItems();
  const sources = newsSourceList();
  const query = state.query.trim().toLowerCase();
  if (query) return renderNewsSearchView(query, all);

  const filterId = state.sourceFilter;
  const filterSource =
    filterId !== 'all' ? sources.find((source) => source.id === filterId) || null : null;
  const pool = filterSource ? all.filter((item) => item.sourceId === filterSource.id) : all;
  const scope = selectScope(pool);
  const globalScope = selectScope(all);
  const items = scope.items;
  const digestKey = digestFingerprint(globalScope);
  const digest =
    state.newsDigest && state.newsDigest.fingerprint === digestKey
      ? state.newsDigest
      : null;
  const digestLoading =
    state.ui.newsDigestLoading && state.ui.newsDigestFingerprint === digestKey;
  const digestError =
    state.ui.newsDigestError && state.ui.newsDigestFingerprint === digestKey
      ? state.ui.newsDigestError
      : null;
  const digestIds = new Set(globalScope.items.map((item) => item.id));

  const errors = sources.filter((source) => state.feeds[source.id]?.error);
  const errorNames = errors.map((source) => source.name).join('、');

  if (!items.length) {
    if (state.ui.refreshing) {
      return loadingView(
        '正在捕获今日热点…',
        `正在并行抓取 ${sources.length} 个新闻源，第一次同步可能需要十几秒。`
      );
    }
    if (filterSource) {
      return `<div class="view news-view">
        <div class="view-head">
          <div>
            <div class="eyebrow"><span class="pulse-dot"></span> NEWSROOM · ${esc(
              filterSource.name
            )}</div>
            <h1 class="view-title">${esc(filterSource.title)}</h1>
            <p class="view-sub">${esc(filterSource.subtitle)}</p>
          </div>
          <div class="head-actions">
            <button class="lg-btn" type="button" data-news-source="all">查看全部新闻</button>
            <button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
              'refresh'
            )} 刷新新闻</button>
          </div>
        </div>
        ${emptyState(
          'search',
          '这个来源今天还没有新报道',
          '切换回全部新闻，或刷新后再看看。',
          `<button class="lg-btn" type="button" data-news-source="all">查看全部新闻</button>`
        )}
      </div>`;
    }
    return `<div class="view news-view">
      ${emptyState(
        'flame',
        errors.length ? '新闻源暂时无法同步' : '今天还没有抓到新闻',
        errors.length
          ? `${errorNames} 同步失败。请检查网络或代理设置后重试。`
          : '点击刷新，从 TechCrunch、Ars Technica、WIRED、IT之家、爱范儿、NPR 等来源抓取今日热点。',
        `<button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
          'refresh'
        )} 抓取今日新闻</button>`
      )}
    </div>`;
  }

  const events = buildHotEvents(items);
  const lead = events[0] || null;
  const sideEvents = events.slice(1, 5);
  const sourceCount = new Set(items.map((item) => item.sourceId)).size;
  const world = items.filter(isWorldItem);
  const tech = items.filter((item) => !isWorldItem(item));
  const hotCount = events.filter((event) => event.coverage > 1).length;
  const keywords = keywordsOf(items, 8);
  const scopeLabel = scope.label;

  return `<div class="view news-view">
    <div class="view-head">
      <div>
        <div class="eyebrow"><span class="pulse-dot"></span> NEWSROOM · ${esc(todayLabel())}</div>
        <h1 class="view-title">${
          filterSource
            ? esc(filterSource.title)
            : `今日<span class="gradient-text">科技热点</span>`
        }</h1>
        <p class="view-sub">${
          filterSource
            ? `只看 ${esc(filterSource.name)} 的${esc(scopeLabel)}报道，共 ${items.length} 条。`
            : `汇总 ${sources.length} 个新闻源，聚焦世界当天热点，科技为主。按媒体报道覆盖与社区热度聚合事件，打开任意一条可站内阅读或跳转原文。`
        }</p>
      </div>
      <div class="head-actions">
        <button class="lg-btn lg-btn--primary" type="button" data-action="refresh" ${
          state.ui.refreshing ? 'disabled' : ''
        }>${icon('refresh')} ${state.ui.refreshing ? '同步中…' : '刷新新闻'}</button>
        <button class="lg-btn" type="button" data-action="open-settings">${icon(
          'globe'
        )} 网络与代理</button>
      </div>
    </div>

    ${
      errors.length
        ? `<div class="notice">${icon('alert')}<span>${esc(
            errorNames
          )} 暂时无法同步，新闻模块会继续显示已缓存的内容。</span><button type="button" data-action="refresh">重试</button></div>`
        : ''
    }

    ${
      filterSource
        ? ''
        : renderNewsDigest({
            digest,
            loading: digestLoading,
            error: digestError,
            autoEnabled: state.settings.autoNewsDigest !== false,
            validIds: digestIds,
          })
    }

    ${renderNewsChips(sources, globalScope.items, filterSource)}

    ${renderNewsHero(
      lead,
      {
        items: items.length,
        sources: sourceCount,
        events: hotCount,
        world: world.length,
        sourceTotal: sources.length,
      },
      keywords,
      scopeLabel
    )}

    ${
      sideEvents.length
        ? `${sectionHead(
            '热点事件',
            '标题相近的报道会聚成同一个事件，按覆盖媒体数与热度排序'
          )}
           <div class="news-event-grid">${sideEvents
             .map((event, index) => renderNewsEventCard(event, index + 2))
             .join('')}</div>`
        : ''
    }

    ${
      world.length
        ? `${sectionHead('世界要闻', `${scopeLabel} · 来自全球新闻源`, `<span class="section-hint">${world.length} 条</span>`)}
           <div class="news-stream news-stream--world">${world
             .slice(0, 8)
             .map(renderNewsRow)
             .join('')}</div>`
        : ''
    }

    ${
      tech.length
        ? `${sectionHead(
            '科技新闻流',
            `${scopeLabel} · 按发布时间排序${tech.length > 80 ? ' · 仅显示最近 80 条' : ''}`,
            `<span class="section-hint">${tech.length} 条</span>`
          )}
           <div class="news-stream">${tech.slice(0, 80).map(renderNewsRow).join('')}</div>`
        : ''
    }
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Claude view                                                         */
/* ------------------------------------------------------------------ */

const PATH_STEPS = [
  {
    title: '模型地图',
    desc: '先搞清楚 Fable、Opus、Sonnet 各自适合什么，再决定把什么交给模型。',
    match: /which-claude-model|model should you build/i,
  },
  {
    title: '跑起来',
    desc: '从 Claude Code 的入门与 Mods 扩展开始，建立日常开发闭环。',
    match: /getting-started|claude-code-mods|mods/i,
  },
  {
    title: '验证闭环',
    desc: '理解 Claude Code 团队如何设计验证，让自动化结果可被信任。',
    match: /verification/i,
  },
  {
    title: '规模与团队',
    desc: '把会话搬到云端，并学习多智能体团队的安全扩展方式。',
    match: /cloud|multi-agent|fable/i,
  },
];

function renderLearningPath(items) {
  return `<div class="path-grid">
    ${PATH_STEPS.map((step, index) => {
      const post = items.find((item) => step.match.test(`${item.link} ${item.title}`));
      const content = `<span class="path-num">0${index + 1}</span>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.desc)}</p>
        <span class="path-post">${post ? esc(post.title) : '该主题文章暂未出现在最新更新中'}</span>`;
      return post
        ? `<button class="path-step" type="button" data-open-id="${esc(post.id)}">${content}</button>`
        : `<div class="path-step is-placeholder">${content}</div>`;
    }).join('')}
  </div>`;
}

function renderClaudeView() {
  const allClaude = claudeItems();
  const items = filterItems();
  const notes = claudeNotes();
  const unread = unreadCount(allClaude);
  const latest = rankedItems(allClaude)[0];
  const claudeError = state.feeds.claude?.error;

  if (!allClaude.length && state.ui.refreshing) {
    return loadingView('Claude 专区正在同步…', '正在抓取 claude.dev 的官方开发者博客。');
  }

  const asideNotes = notes.slice(0, 4);

  return `<div class="view">
    <section class="claude-hero">
      <span class="claude-badge">${icon('sparkle')} Featured 专区</span>
      <h1 class="view-title">Claude 专区</h1>
      <p class="view-sub">${esc(
        state.sources.find((source) => source.id === 'claude')?.description ||
          'Anthropic 开发者团队关于 Claude 与 Claude Code 的工程实践、提示技巧与构建日志。'
      )}</p>
      <div class="claude-hero-actions">
        <button class="lg-btn lg-btn--primary" type="button" data-action="refresh" ${
          state.ui.refreshing ? 'disabled' : ''
        }>${icon('refresh')} ${state.ui.refreshing ? '同步中…' : '刷新专区'}</button>
        <button class="lg-btn" type="button" data-external="https://claude.dev/">${icon(
          'external'
        )} 打开 claude.dev</button>
        <span class="section-hint">${allClaude.length} 篇文章 · ${unread} 条未读 · ${
    notes.length
  } 篇笔记</span>
      </div>
    </section>

    ${
      claudeError
        ? `<div class="notice">${icon('alert')}<span>claude.dev 同步失败：${esc(
            claudeError
          )}。请稍后重试。</span><button type="button" data-action="refresh">重试</button></div>`
        : ''
    }

    ${sectionHead('学习路线', '从最新文章中自动串起的学习顺序')}
    ${renderLearningPath(allClaude)}

    <div class="claude-layout" style="margin-top:28px">
      <div>
        ${sectionHead(
          state.query ? '搜索结果' : '最新文章',
          '',
          `<label class="check-toggle"><input type="checkbox" id="unread-toggle" ${
            state.unreadOnly ? 'checked' : ''
          } /> 只看未读</label>`
        )}
        ${
          items.length
            ? `<div class="feed-grid">${items
                .map((item, index) =>
                  renderCard(item, { lead: index === 0 && !state.query && !state.unreadOnly })
                )
                .join('')}</div>`
            : emptyState(
                'sparkle',
                state.query ? '没有匹配的文章' : '专区还没有文章',
                state.query
                  ? '换一个关键词，或清除搜索后查看全部 Claude 文章。'
                  : claudeError
                  ? '暂时无法从 claude.dev 获取文章，请检查网络后重试。'
                  : '点击「刷新专区」从 claude.dev 抓取最新内容。',
                state.query
                  ? `<button class="lg-btn" type="button" data-action="clear-search">清除搜索</button>`
                  : `<button class="lg-btn lg-btn--primary" type="button" data-action="refresh">${icon(
                      'refresh'
                    )} 刷新专区</button>`
              )
        }
      </div>

      <aside class="claude-aside">
        <div class="aside-card">
          <h3>为什么单开一个专区？</h3>
          <p>claude.dev 是 Anthropic 开发者团队的一手工程内容：构建日志、验证方法、多智能体实践与模型选择。这里把更新、学习路线与精读笔记放在一起，方便持续跟进。</p>
          <div class="source-link-row">
            <a data-external="https://claude.dev/">claude.dev ${icon('arrow-up-right')}</a>
            <a data-external="https://claude.dev/rss.xml">RSS ${icon('rss')}</a>
          </div>
        </div>

        <div class="aside-card">
          <h3>专区笔记</h3>
          <p>${notes.length ? `已有 ${notes.length} 篇笔记。` : '在文章里写下理解，就会沉淀到这里。'}</p>
          ${
            asideNotes.length
              ? `<div class="aside-notes">${asideNotes
                  .map(
                    (note) =>
                      `<button class="aside-note" type="button" data-open-note="${esc(note.id)}">
                        <strong>${esc(note.title)}</strong>
                        ${esc(clampText(note.text, 90))}
                      </button>`
                  )
                  .join('')}</div>`
              : ''
          }
          <div class="source-link-row">
            <a data-nav="notes" role="button" tabindex="0">全部笔记 →</a>
            <span class="section-hint">${notes.length} 篇</span>
          </div>
        </div>

        ${
          latest
            ? `<div class="aside-card">
                <h3>最近更新</h3>
                <p>${esc(latest.title)}</p>
                <div class="source-link-row">
                  <a data-open-id="${esc(latest.id)}" role="button" tabindex="0">现在阅读 →</a>
                  <span class="section-hint">${esc(timeAgo(latest.publishedAt))}</span>
                </div>
              </div>`
            : ''
        }
      </aside>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Notes view                                                          */
/* ------------------------------------------------------------------ */

function renderNotesView() {
  const all = notesList();
  const query = state.query.trim().toLowerCase();
  const notes = query
    ? all.filter((note) => `${note.title} ${note.text}`.toLowerCase().includes(query))
    : all;

  return `<div class="view">
    <div class="view-head">
      <div>
        <div class="eyebrow"><span class="pulse-dot"></span> NOTEBOOK · 学习笔记</div>
        <h1 class="view-title">学习笔记</h1>
        <p class="view-sub">${all.length ? `共 ${all.length} 篇笔记，按最后更新时间排序。` : '在阅读面板里随手写下理解、疑问或行动项，会沉淀在这里。'} 笔记只保存在本机，可一键导出 Markdown。</p>
      </div>
      <div class="head-actions">
        ${
          all.length
            ? `<button class="lg-btn" type="button" data-action="export-notes-pdf">${icon(
                'download'
              )} 导出 PDF</button>
               <button class="lg-btn lg-btn--primary" type="button" data-action="export-notes">${icon(
                 'download'
               )} 导出 Markdown</button>`
            : ''
        }
      </div>
    </div>

    ${
      notes.length
        ? `<div class="note-list">${notes
            .map((note) => {
              const source = sourceMap()[note.sourceId] || { id: note.sourceId, name: note.sourceId, mark: 'NA' };
              return `<article class="note-card">
                <div class="note-card-top">
                  ${sourceChip(source)}
                  <span class="card-time">更新于 ${esc(timeAgo(note.updatedAt))}</span>
                </div>
                <h3 data-open-note="${esc(note.id)}">${esc(note.title)}</h3>
                <p class="note-excerpt">${esc(note.text)}</p>
                <div class="note-actions">
                  <button class="lg-btn lg-btn--sm" type="button" data-open-note="${esc(
                    note.id
                  )}">${icon('book')} 继续阅读</button>
                  <button class="lg-btn lg-btn--sm lg-btn--danger" type="button" data-action="delete-note" data-id="${esc(
                    note.id
                  )}">${icon('trash')} 删除</button>
                </div>
              </article>`;
            })
            .join('')}</div>`
        : emptyState(
            'note',
            query ? '没有匹配的笔记' : '还没有学习笔记',
            query ? '换一个关键词，或清除搜索后再看看。' : '打开任意一篇文章，在底部的笔记区写下第一段理解。',
            query
              ? `<button class="lg-btn" type="button" data-action="clear-search">清除搜索</button>`
              : `<button class="lg-btn lg-btn--primary" type="button" data-nav="all">去阅读资讯</button>`
          )
    }
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Reader                                                              */
/* ------------------------------------------------------------------ */

function runsHtml(runs, fallbackText = '') {
  if (!Array.isArray(runs) || !runs.length) return esc(fallbackText);
  return runs
    .map((run) => {
      let out = esc(run.text);
      if (run.code) out = `<code>${out}</code>`;
      if (run.bold) out = `<strong>${out}</strong>`;
      if (run.italic) out = `<em>${out}</em>`;
      if (run.href && /^https?:\/\//i.test(run.href)) {
        out = `<a href="${esc(run.href)}" data-external="1" rel="noreferrer noopener">${out}</a>`;
      }
      return out;
    })
    .join('');
}

function blocksToHtml(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return '';
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          const level = Math.min(4, Math.max(2, Number(block.level) || 2));
          return `<h${level}>${esc(block.text)}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${runsHtml(block.runs, block.text)}</p>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          return `<${tag}>${(block.items || [])
            .map((item) => `<li>${runsHtml(item.runs, item.text)}</li>`)
            .join('')}</${tag}>`;
        }
        case 'quote':
          return `<blockquote>${runsHtml(block.runs, block.text)}</blockquote>`;
        case 'code':
          return `<pre>${block.lang ? `<span class="article-code-lang">${esc(block.lang)}</span>` : ''}<code>${esc(
            block.text
          )}</code></pre>`;
        case 'divider':
          return '<hr />';
        default:
          return block.text ? `<p>${esc(block.text)}</p>` : '';
      }
    })
    .join('');
}

function modelLabel(model) {
  return MODEL_LABELS[model] || model || 'AI';
}

function renderLocalSummary(article) {
  const summary = article?.summary;
  const bullets = summary?.bullets || [];
  if (!bullets.length) return '';
  const keywords = summary.keywords || [];
  const ai = getAISummary(article.id);
  const aiLoading = state.ui.aiLoading;
  return `<section class="summary-card">
    <div class="summary-head">
      <span class="summary-title">${icon('zap')} 速读要点</span>
      <span class="summary-meta">${summary.readMinutes || 1} 分钟 · ${summary.wordCount || 0} 字</span>
    </div>
    <ul class="summary-list">${bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul>
    ${
      keywords.length
        ? `<div class="keyword-row">${keywords
            .map((keyword) => `<span class="keyword">${esc(keyword)}</span>`)
            .join('')}</div>`
        : ''
    }
    ${
      state.ui.aiError
        ? `<div class="reader-error" style="margin-top:12px;margin-bottom:0">${esc(state.ui.aiError)}</div>`
        : ''
    }
    <div class="summary-foot">
      <span class="summary-hint">本地提取，无需联网${ai ? ' · 已有 AI 精读' : ''}</span>
      ${
        aiLoading
          ? `<span class="ai-loading"><span class="lg-spinner"></span>AI 正在精读…</span>`
          : `<button class="lg-btn" type="button" data-action="ai-summary">${icon(
              'sparkle'
            )} AI 精读</button>`
      }
    </div>
  </section>`;
}

function renderAICard(ai) {
  const data = ai.data || {};
  const points = data.keyPoints || [];
  const terms = data.terms || [];
  const questions = data.questions || [];
  return `<section class="ai-card">
    <div class="ai-head">
      <span class="ai-badge">${icon('sparkle')} AI 精读</span>
      <span class="ai-level">${esc(data.level || '进阶')}</span>
    </div>
    ${data.tldr ? `<p class="ai-tldr">${esc(data.tldr)}</p>` : ''}
    ${
      points.length
        ? `<div class="ai-section"><h4>关键要点</h4><ul class="ai-points">${points
            .map((point) => `<li>${esc(point)}</li>`)
            .join('')}</ul></div>`
        : ''
    }
    ${
      data.whyItMatters
        ? `<div class="ai-section"><h4>为什么值得关注</h4><p class="ai-text">${esc(
            data.whyItMatters
          )}</p></div>`
        : ''
    }
    ${
      terms.length
        ? `<div class="ai-section"><h4>术语卡</h4><dl style="margin:0">${terms
            .map(
              (term) =>
                `<div class="term-row"><dt>${esc(term.term)}</dt><dd>${esc(term.note)}</dd></div>`
            )
            .join('')}</dl></div>`
        : ''
    }
    ${
      questions.length
        ? `<div class="ai-section"><h4>带着这些问题继续学习</h4><ul class="ai-questions">${questions
            .map((question) => `<li>${esc(question)}</li>`)
            .join('')}</ul></div>`
        : ''
    }
    <div class="ai-foot">
      <span>${esc(ai.providerLabel ? `${ai.providerLabel} · ` : '')}${esc(
    modelLabel(ai.model)
  )} · ${esc(timeAgo(ai.generatedAt))}${
    ai.usage ? ` · ${ai.usage.inputTokens || 0} in / ${ai.usage.outputTokens || 0} out tokens` : ''
  }</span>
      ${
        state.ui.article
          ? `<button class="lg-btn lg-btn--sm" type="button" data-action="ai-summary">${icon(
              'refresh'
            )} 重新精读</button>`
          : '<span class="summary-hint">正文未缓存，暂时无法重新精读</span>'
      }
    </div>
  </section>`;
}

function readerMetaParts(item, article) {
  const parts = [];
  if (item.publishedAt) parts.push(formatDateTime(item.publishedAt));
  else if (article?.publishedAt) parts.push(formatDateTime(article.publishedAt));
  if (item.author) parts.push(clampText(item.author, 48));
  if (article?.summary?.readMinutes) parts.push(`约 ${article.summary.readMinutes} 分钟`);
  if (item.meta?.points) parts.push(`${item.meta.points} 热度`);
  if (article?.extractedWith === 'markdown') parts.push('官方 Markdown');
  if (article?.fromCache) parts.push('本地缓存');
  return parts;
}

export function renderReaderContent() {
  const item = state.ui.activeItem;
  if (!item) return '';
  const article = state.ui.article;
  const ai = getAISummary(item.id);
  const title = article?.title || item.title;
  const metaParts = readerMetaParts(item, article);
  const aiCard = ai ? renderAICard(ai) : '';
  const localSummary = article ? renderLocalSummary(article) : '';

  return `<h1 class="reader-title">${esc(title)}</h1>
    <div class="reader-sub">${metaParts
      .map((part) => esc(part))
      .join('<span class="dot"></span>')}</div>
    ${
      state.ui.dictionaryOn
        ? `<div class="reader-dict-hint">${icon('book')} 双击英文单词查词典</div>`
        : ''
    }

    ${
      state.ui.aiLoading
        ? `<div class="ai-card"><div class="ai-head"><span class="ai-badge">${icon(
            'sparkle'
          )} AI 精读</span></div><div class="ai-loading"><span class="lg-spinner"></span>正在理解文章、提取要点并生成中文精读…</div></div>`
        : ''
    }

    ${aiCard}
    ${state.ui.articleLoading ? '' : localSummary}

    ${
      state.ui.articleError
        ? `<div class="reader-error">${icon('alert')} 正文抓取失败：${esc(
            state.ui.articleError
          )}。你仍然可以查看原始摘要，或到浏览器中打开原文。</div>
           <div class="feed-summary-fallback">
             <h4>来源摘要</h4>
             <p>${esc(item.summary)}</p>
           </div>`
        : ''
    }

    ${
      state.ui.articleLoading
        ? `<div class="reader-loading"><div class="line"></div><div class="line"></div><div class="line"></div><div class="line"></div></div>`
        : article
        ? `<div class="reader-body article-body">${blocksToHtml(article.blocks)}</div>`
        : ''
    }

    ${
      !article && !state.ui.articleLoading && !state.ui.articleError
        ? `<div class="feed-summary-fallback"><h4>摘要</h4><p>${esc(item.summary)}</p></div>`
        : ''
    }`;
}

const INK_COLORS = [
  ['primary', '紫色', 'var(--accent-primary)'],
  ['secondary', '青色', 'var(--accent-secondary)'],
  ['danger', '红色', 'var(--text-danger)'],
  ['text', '高对比', 'var(--text-tertiary)'],
];
const INK_COLOR_KEYS = new Set(INK_COLORS.map(([key]) => key));

function inkPathD(points) {
  if (!Array.isArray(points) || !points.length) return '';
  const clean = points
    .filter(
      (point) =>
        Array.isArray(point) &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    )
    .map((point) => [Number(point[0]).toFixed(1), Number(point[1]).toFixed(1)]);
  if (!clean.length) return '';
  let d = `M ${clean[0][0]} ${clean[0][1]}`;
  if (clean.length === 1) return `${d} l 0.1 0`;
  for (let i = 1; i < clean.length; i += 1) {
    d += ` L ${clean[i][0]} ${clean[i][1]}`;
  }
  return d;
}

export function renderInkStrokes(itemId) {
  const strokes = state.ink?.[itemId]?.strokes;
  if (!Array.isArray(strokes) || !strokes.length) return '';
  return strokes
    .map((stroke) => {
      const color = INK_COLOR_KEYS.has(stroke?.color) ? stroke.color : 'primary';
      const width = Math.min(12, Math.max(1, Number(stroke?.width) || 4));
      const d = inkPathD(stroke?.points);
      if (!d) return '';
      return `<path class="ink-stroke ink-${color}" d="${d}" stroke-width="${width}" vector-effect="non-scaling-stroke" />`;
    })
    .join('');
}

function renderPenToolbar() {
  const widths = [2, 4, 7];
  return `<div class="reader-pen-toolbar" role="toolbar" aria-label="画笔工具" ${
    state.ui.penActive ? '' : 'hidden'
  }>
    <div class="pen-colors">
      ${INK_COLORS.map(
        ([key, label, token]) =>
          `<button class="pen-color${state.ui.penColor === key ? ' is-active' : ''}" type="button" data-action="pen-color" data-color="${key}" title="${label}" style="--ink:${token}"></button>`
      ).join('')}
    </div>
    <div class="pen-widths">
      ${widths
        .map(
          (width) =>
            `<button class="pen-width${state.ui.penWidth === width ? ' is-active' : ''}" type="button" data-action="pen-width" data-width="${width}" title="${
              width <= 2 ? '细线' : width >= 7 ? '粗线' : '中线'
            }"><span class="pen-dot" style="--dot:${width + 2}px"></span></button>`
        )
        .join('')}
    </div>
    <span class="pen-sep"></span>
    <button class="pen-tool${state.ui.penEraser ? ' is-active' : ''}" type="button" data-action="pen-eraser" title="橡皮擦">${icon('eraser')}</button>
    <button class="pen-tool" type="button" data-action="pen-undo" title="撤销 (Ctrl+Z)">${icon('undo')}</button>
    <button class="pen-tool" type="button" data-action="pen-clear" title="清空当前文章笔迹">${icon('trash')}</button>
    <button class="pen-tool" type="button" data-action="pen-toggle" title="退出画笔 (P)">${icon('close')}</button>
  </div>`;
}

function readerLayoutButtons() {
  const current = state.ui.readerLayout || 'center';
  return `<div class="reader-layout-group" role="group" aria-label="阅读布局">${[
    ['center', '居中阅读', 'layout-center'],
    ['split', '分栏阅读', 'layout-split'],
    ['fullscreen', '全屏阅读', 'layout-fullscreen'],
  ]
    .map(
      ([mode, title, iconName]) =>
        `<button class="reader-layout-btn${
          current === mode ? ' is-active' : ''
        }" type="button" data-action="reader-layout" data-layout="${mode}" title="${title}" aria-label="${title}" aria-pressed="${
          current === mode
        }">${icon(iconName)}</button>`
    )
    .join('')}</div>`;
}

export function renderReaderPanel() {
  const item = state.ui.activeItem;
  if (!item) return '';
  const saved = state.saved.has(item.id);
  const note = getNote(item.id);
  const title = state.ui.article?.title || item.title;
  const isModal = state.ui.readerLayout !== 'split';
  const isCenter = state.ui.readerLayout === 'center';
  const readerWidth = Math.min(1400, Math.max(520, state.ui.readerWidth || 800));
  const panelSize = isCenter
    ? `width:${readerWidth}px;${state.ui.readerHeight ? `height:${state.ui.readerHeight}px;` : ''}`
    : '';

  return `<aside class="reader-panel" role="dialog" ${
    isModal ? 'aria-modal="true"' : ''
  }${panelSize ? ` style="${panelSize}"` : ''} aria-label="${esc(title)}">
      <header class="reader-head">
        <div class="reader-head-left">
          ${sourceChip(item.source)}
          <span class="card-time">${esc(timeAgo(item.publishedAt))}</span>
        </div>
        <div class="reader-head-actions">
          <button class="lg-icon-btn reader-font-btn${
            state.ui.fontOpen ? ' is-active' : ''
          }" type="button" data-action="font-popover" title="阅读排版" aria-label="阅读排版" aria-expanded="${
            !!state.ui.fontOpen
          }"><span class="reader-font-label">Aa</span></button>
          <button class="lg-icon-btn reader-pen-btn${
            state.ui.penActive ? ' is-active' : ''
          }" type="button" data-action="pen-toggle" title="画笔 (P)" aria-label="画笔" aria-pressed="${
            state.ui.penActive
          }">${icon('pen')}</button>
          ${readerLayoutButtons()}
          <button class="lg-icon-btn" type="button" data-action="save" data-id="${esc(
            item.id
          )}" title="${saved ? '取消收藏' : '收藏'}" aria-pressed="${saved}">${icon('bookmark', {
    fill: saved,
  })}</button>
          ${
            state.ui.readerLayout !== 'split'
              ? `<button class="lg-icon-btn" type="button" data-action="export-pdf" title="导出 PDF">${icon(
                  'download'
                )}</button>`
              : ''
          }
          ${
            state.ui.readerLayout !== 'split'
              ? `<button class="lg-icon-btn" type="button" data-external="${esc(
                  item.link
                )}" title="在浏览器中打开原文">${icon('external')}</button>`
              : ''
          }
          <button class="lg-icon-btn" type="button" data-action="close-reader" title="关闭 (Esc)">${icon(
            'close'
          )}</button>
        </div>
      </header>

      <div class="reader-scroll lg-scroll">
        <div class="reader-content-stack">
          <div id="reader-content">${renderReaderContent()}</div>
          <svg class="reader-ink${
            state.ui.penActive ? ' is-active' : ''
          }" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${renderInkStrokes(
    item.id
  )}</svg>
        </div>

        <section class="reader-note">
          <div class="reader-note-head">
            <span>${icon('note')} 学习笔记</span>
            <span class="note-status" id="note-status">${
              note ? `上次保存 ${esc(timeAgo(note.updatedAt))}` : '自动保存到本机'
            }</span>
          </div>
          <textarea id="note-input" placeholder="写下你的理解、疑问或下一步行动…" spellcheck="false">${esc(
            note?.text || ''
          )}</textarea>
          <div class="reader-note-hint">只保存在本机 · 可随时在「学习笔记」中导出 Markdown</div>
        </section>

        <footer class="reader-footer">
          <span>来源：${esc(item.source?.title || item.source?.name || '')}</span>
          <div class="reader-footer-actions">
            <button type="button" data-action="export-pdf" title="导出当前文章为 PDF">${icon(
              'download'
            )} 导出 PDF</button>
            <button type="button" data-external="${esc(
              item.link
            )}">查看原文 ${icon('arrow-up-right')}</button>
          </div>
        </footer>
      </div>
      ${renderPenToolbar()}
      ${
        isCenter
          ? `<div class="reader-resize-grip" title="拖动调整阅读框大小，双击重置" aria-hidden="true">${icon(
              'grip'
            )}</div>`
          : ''
      }
      ${
        state.ui.readerLayout === 'fullscreen'
          ? '<div class="reader-width-grip" title="拖动调整阅读宽度，双击恢复默认"></div>'
          : ''
      }
    </aside>`;
}

function renderReader() {
  const layout = state.ui.readerLayout === 'fullscreen' ? 'fullscreen' : 'center';
  return `<div class="reader-overlay reader-overlay--${layout}" data-action="close-reader">${renderReaderPanel()}</div>`;
}

/* ------------------------------------------------------------------ */
/* Settings / theme popover                                            */
/* ------------------------------------------------------------------ */

function themeOptions(activeTheme, optionClass) {
  return THEME_OPTIONS.map(
    (theme) => `<button class="${optionClass}${
      activeTheme === theme.id ? ' is-active' : ''
    }" type="button" data-theme-option="${theme.id}" title="${esc(theme.label)}" role="radio" aria-checked="${
      activeTheme === theme.id
    }">
      <span class="theme-swatch" data-swatch="${theme.id}"></span>
      <span class="theme-option-name">${esc(theme.label)}</span>
    </button>`
  ).join('');
}

export function renderThemePopover(position = {}) {
  const style = `top:${Math.round(position.top || 64)}px;right:${Math.round(position.right || 16)}px;`;
  const grayTheme = state.theme === 'black' || state.theme === 'graphite';
  const grayValue = state.themeGray[state.theme] ?? 3;
  const alpha = Number.isFinite(state.glassAlpha) ? state.glassAlpha : 100;
  const background = state.glassBackground || 'clean';
  const optical = state.opticalGlass !== false;

  return `<div class="lg-popover theme-popover" style="${esc(
    style
  )}" role="dialog" aria-label="外观与主题">
    <div class="theme-panel-head">
      <div class="theme-panel-titles">
        <span class="theme-panel-title">外观</span>
        <span class="theme-panel-sub">主题 · 玻璃 · 材质</span>
      </div>
      <button class="theme-params-icon" type="button" data-action="glass-params" title="材质与光效参数" aria-label="材质与光效参数">${icon(
        'sliders',
        { strokeWidth: 2 }
      )}</button>
    </div>

    <div class="theme-grid" role="radiogroup" aria-label="主题">${themeOptions(
      state.theme,
      'lg-theme-option'
    )}</div>

    <div class="theme-controls">
      <div class="theme-slider-row">
        <span class="theme-slider-label">玻璃</span>
        <input class="theme-slider" type="range" min="0" max="100" step="1" value="${alpha}" data-glass-alpha aria-label="玻璃透明度" />
        <span class="theme-slider-value" data-glass-alpha-value>${alpha}%</span>
      </div>
      <div class="theme-slider-row${grayTheme ? '' : ' is-disabled'}">
        <span class="theme-slider-label">灰度</span>
        <input class="theme-slider" type="range" min="0" max="20" step="1" value="${
          grayTheme ? grayValue : 3
        }" data-theme-gray ${grayTheme ? '' : 'disabled'} aria-label="灰度" />
        <span class="theme-slider-value" data-theme-gray-value>${grayTheme ? grayValue : '—'}</span>
      </div>
      <div class="theme-toggle-row">
        <span class="theme-slider-label">光学</span>
        <span class="theme-toggle-text">WebGL2 折射玻璃</span>
        <label class="check-toggle theme-toggle-switch">
          <input type="checkbox" data-optical-toggle ${optical ? 'checked' : ''} aria-label="启用光学折射玻璃" />
          <span>${optical ? '开启' : '关闭'}</span>
        </label>
      </div>
      <div class="theme-seg-row">
        <span class="theme-slider-label">环境</span>
        <div class="theme-segmented" role="radiogroup" aria-label="光学玻璃背景">
          ${GLASS_BACKGROUNDS.map(
            (mode) =>
              `<button class="theme-seg${
                background === mode.id ? ' is-active' : ''
              }" type="button" data-action="glass-background" data-glass-background="${
                mode.id
              }" role="radio" aria-checked="${background === mode.id}">${mode.label}</button>`
          ).join('')}
        </div>
      </div>
      <div class="theme-toggle-row">
        <span class="theme-slider-label">漂移</span>
        <span class="theme-toggle-text">环境缓慢流动</span>
        <label class="check-toggle theme-toggle-switch">
          <input type="checkbox" data-glass-animation ${
            state.glassAnimation ? 'checked' : ''
          } aria-label="背景缓慢漂移" />
          <span>${state.glassAnimation ? '开启' : '关闭'}</span>
        </label>
      </div>
      <button class="theme-params-trigger" type="button" data-action="glass-params">
        ${icon('sliders', { strokeWidth: 2 })}
        <span>材质与光效参数</span>
        <span class="theme-params-arrow">${icon('arrow-right', { strokeWidth: 2 })}</span>
      </button>
    </div>
    <div class="theme-hint">所有调整只改变外观，立即生效并记住选择。关闭光学后自动回到 CSS 玻璃。</div>
  </div>`;
}

function renderDictSenses(entries, lang) {
  return entries
    .map(
      (group) => `<div class="dict-pos-group">
        ${group.pos ? `<span class="dict-pos">${esc(group.pos)}</span>` : ''}
        <ol class="dict-senses">
          ${group.senses
            .map(
              (sense) => `<li class="dict-sense">
                ${
                  lang === 'zh' && sense.trans
                    ? `<p class="dict-trans">${esc(sense.trans)}</p>`
                    : ''
                }
                ${sense.def ? `<p class="dict-def">${esc(sense.def)}</p>` : ''}
                ${
                  sense.example
                    ? `<p class="dict-example">${esc(sense.example)}${
                        sense.exampleTrans
                          ? `<span class="dict-example-zh">${esc(sense.exampleTrans)}</span>`
                          : ''
                      }</p>`
                    : ''
                }
              </li>`
            )
            .join('')}
        </ol>
      </div>`
    )
    .join('');
}

const DICT_TAGS = {
  zk: '中考',
  gk: '高考',
  cet4: 'CET4',
  cet6: 'CET6',
  ky: '考研',
  toefl: '托福',
  ielts: '雅思',
  gre: 'GRE',
};

function dictBadges(ecdict) {
  if (!ecdict) return '';
  const badges = [];
  if (ecdict.oxford) badges.push('牛津3000');
  if (ecdict.collins) badges.push(`柯林斯 ${'★'.repeat(Math.min(5, ecdict.collins))}`);
  String(ecdict.tag || '')
    .split(/\s+/)
    .filter(Boolean)
    .forEach((tag) => {
      if (DICT_TAGS[tag]) badges.push(DICT_TAGS[tag]);
    });
  if (ecdict.lemma && ecdict.lemma !== ecdict.word) {
    badges.push(`词形 ${ecdict.lemma} → ${ecdict.word}`);
  }
  if (!badges.length) return '';
  return `<div class="dict-badges">${badges
    .map((badge) => `<span class="dict-badge">${esc(badge)}</span>`)
    .join('')}</div>`;
}

export function renderDictionaryPopover() {
  const dict = state.ui.dictionary;
  if (!dict) return '';
  const style = `left:${Math.round(dict.x)}px;top:${Math.round(dict.y)}px;`;
  const data = dict.data;
  const phonetic = data?.phonetics?.length
    ? `/${String(data.phonetics[0]).replace(/^\/+|\/+$/g, '')}/`
    : '';
  let body = '';

  if (dict.loading) {
    body = `<div class="dict-loading"><span class="lg-spinner"></span><span>正在查询 Cambridge Dictionary…</span></div>`;
  } else if (dict.error) {
    body = `<div class="dict-error">
      <p>${esc(dict.error)}</p>
      <div class="dict-error-actions">
        <button class="lg-btn lg-btn--sm" type="button" data-action="dictionary-retry" data-word="${esc(
          dict.word
        )}">${icon('refresh')} 重试</button>
        ${
          dict.sourceUrl
            ? `<button class="lg-btn lg-btn--sm" type="button" data-external="${esc(
                dict.sourceUrl
              )}">${icon('external')} 在 Cambridge 打开</button>`
            : ''
        }
      </div>
    </div>`;
  } else if (data) {
    const englishLabel =
      data.englishSource === 'wiktionary' ? 'Wiktionary' : 'Cambridge 英英';
    body = `
      ${
        data.english?.length
          ? `<section class="dict-section">
              <div class="dict-section-head"><span>英英</span><span class="dict-source">${esc(
                englishLabel
              )}</span></div>
              ${renderDictSenses(data.english, 'en')}
            </section>`
          : ''
      }
      ${
        data.chinese?.length
          ? `<section class="dict-section">
              <div class="dict-section-head"><span>英汉</span><span class="dict-source">${
                data.chineseSource === 'ecdict' ? 'ECDICT 离线' : 'Cambridge 英汉'
              }</span></div>
              ${renderDictSenses(data.chinese, 'zh')}
            </section>`
          : data.english?.length
          ? ''
          : `<div class="dict-empty">没有可显示的释义。</div>`
      }
      ${
        !data.english?.length && !data.chinese?.length
          ? `<div class="dict-empty">Cambridge 暂时没有返回这个词的释义。</div>`
          : ''
      }`;
  }

  return `<div class="dict-popover" style="${esc(style)}" role="dialog" aria-label="英文词典">
    <header class="dict-head">
      <div class="dict-head-text">
        <div class="dict-word-line">
          <span class="dict-word">${esc(dict.word)}</span>
          ${phonetic ? `<span class="dict-phonetic">${esc(phonetic)}</span>` : ''}
        </div>
        <div class="dict-sub">${
          data
            ? data.offlineOnly
              ? 'ECDICT 离线词典 · 双击查词'
              : 'Cambridge Dictionary · 双击查词'
            : 'Cambridge Dictionary'
        }</div>
        ${data ? dictBadges(data.ecdict) : ''}
      </div>
      <button class="dict-close" type="button" data-action="close-dictionary" title="关闭" aria-label="关闭">${icon(
        'close',
        { strokeWidth: 2 }
      )}</button>
    </header>
    <div class="dict-body lg-scroll">${body}</div>
    ${
      data
        ? `<footer class="dict-foot">
            ${
              data.englishUrl
                ? `<button type="button" data-external="${esc(
                    data.englishUrl
                  )}">英英原文</button>`
                : ''
            }
            ${
              data.chineseUrl
                ? `<button type="button" data-external="${esc(
                    data.chineseUrl
                  )}">英汉原文</button>`
                : ''
            }
            ${
              data.offlineOnly
                ? `<button type="button" data-action="dictionary-retry" data-word="${esc(
                    dict.word
                  )}">联网重查</button>`
                : ''
            }
            <span>${
              data.offlineOnly ? '离线 ECDICT · 联网后可重查' : '按需查询 · 仅供学习参考'
            }</span>
          </footer>`
        : ''
    }
  </div>`;
}

export function renderGlassParamsPanel(position = {}) {
  const style = `top:${Math.round(position.top || 64)}px;right:${Math.round(
    position.right || 16
  )}px;`;
  const params = normalizeGlassParams(state.glassParams);
  return `<div class="lg-popover glass-params-panel" style="${esc(
    style
  )}" role="dialog" aria-label="光学玻璃材质与光效">
    <header class="glass-params-head">
      <div class="theme-panel-titles">
        <span class="theme-panel-title">材质与光效</span>
        <span class="theme-panel-sub">实时生效 · 跟随主题</span>
      </div>
      <div class="glass-params-actions">
        <button class="glass-params-reset" type="button" data-action="glass-params-reset" title="恢复默认材质" aria-label="恢复默认材质">${icon(
          'reset',
          { strokeWidth: 2 }
        )}</button>
        <button class="glass-params-close" type="button" data-action="close-glass-params" title="关闭" aria-label="关闭">${icon(
          'close',
          { strokeWidth: 2 }
        )}</button>
      </div>
    </header>
    <div class="glass-params-grid">
      ${GLASS_PARAM_SECTIONS.map(
        (section) => `<section class="glass-params-section">
          <header class="glass-params-section-head">
            <span>${esc(section.title)}</span>
            <small>${esc(section.hint)}</small>
          </header>
          <div class="glass-params-rows">
            ${section.fields
              .map((field) => {
                const value = params[field.key];
                return `<label class="glass-param-row">
                  <span class="glass-param-label">${esc(field.label)}</span>
                  <input class="theme-slider glass-param-slider" type="range" min="${
                    field.min
                  }" max="${field.max}" step="${field.step}" value="${value}" data-glass-param="${
                  field.key
                }" aria-label="${esc(field.label)}" />
                  <output class="glass-param-value" data-glass-param-value="${
                    field.key
                  }">${formatGlassParam(field, value)}</output>
                </label>`;
              })
              .join('')}
          </div>
        </section>`
      ).join('')}
    </div>
    <div class="glass-params-foot">
      <span>18 项材质、阴影、边缘高光与反射参数由 WebGL2 光学层实时渲染。</span>
      <span class="glass-params-fallback">无 WebGL2 或关闭光学时自动保留 CSS 玻璃。</span>
    </div>
  </div>`;
}

export function renderSettingsModal() {
  const settings = state.settings;
  const glassBackground = state.glassBackground || 'clean';
  const readerFontSize = state.ui.readerFontSize || 17;
  const aiProvider = ['anthropic', 'deepseek', 'custom', 'local-claude'].includes(
    settings.aiProvider
  )
    ? settings.aiProvider
    : 'local-claude';
  const aiModel = settings.aiModel || '';
  const localConfig = settings.localConfig || null;
  const providerNames = {
    anthropic: 'Anthropic 官方',
    deepseek: 'DeepSeek',
    custom: '自定义 OpenAI 兼容',
    'local-claude': 'Claude Code 本机配置',
  };
  const providerDescs = {
    anthropic: '使用 Anthropic 官方 API，默认模型 Claude Opus 5.5。',
    deepseek: '使用 DeepSeek 原生 OpenAI 兼容 API，默认模型 deepseek-chat。',
    custom: '任意 OpenAI 兼容接口：Ollama、LM Studio、OpenAI、国内中转等。',
    'local-claude':
      '直接沿用 ~/.claude/settings.json 中的 ANTHROPIC_BASE_URL / AUTH_TOKEN / MODEL。适合已经在 Claude Code 中配置好 DeepSeek 或其他 Anthropic 兼容服务的用户。',
  };
  const keyStatus = settings.hasApiKey
    ? `<span class="status-dot is-on"></span>已配置${settings.keyHint ? ` · ${esc(settings.keyHint)}` : ''}`
    : '<span class="status-dot"></span>尚未配置 API Key';
  const secureNote = settings.secure
    ? 'Key 通过操作系统安全存储（safeStorage）加密后保存在本机，不会写入日志或发送到 AI 服务商之外的服务。'
    : '当前系统不支持安全存储，Key 只在本次运行期间保留，不会写入磁盘。';
  const keyPlaceholder =
    aiProvider === 'anthropic' ? 'sk-ant-…' : aiProvider === 'deepseek' ? 'sk-…' : '可留空（Ollama / 本地接口）';
  const keyHelp =
    aiProvider === 'anthropic'
      ? ' 获取 Key：<a data-external="https://console.anthropic.com/settings/keys">console.anthropic.com</a>'
      : aiProvider === 'deepseek'
      ? ' 获取 Key：<a data-external="https://platform.deepseek.com/api_keys">platform.deepseek.com</a>'
      : ' 本地接口（Ollama / LM Studio）通常不需要 Key。';
  const modelPlaceholder =
    aiProvider === 'deepseek'
      ? 'deepseek-chat 或 deepseek-reasoner'
      : aiProvider === 'custom'
      ? '例如 qwen2.5:7b'
      : 'claude-opus-5-5';
  const localOk = !!(localConfig && localConfig.ok);
  const localBlock = `<div class="local-config ${localOk ? 'is-ok' : 'is-error'}">
    <div class="local-config-head">
      <span class="status-dot ${localOk ? 'is-on' : 'is-warn'}"></span>
      <span>${localOk ? '已找到本机 Claude Code 配置' : esc(localConfig?.error || '未检测到本机 Claude Code 配置')}</span>
    </div>
    ${
      localOk
        ? `<div class="local-config-meta">
            <span>接口</span><strong>${esc(localConfig.baseUrl || 'Anthropic 官方')}</strong>
            <span>模型</span><strong>${esc(localConfig.model || '—')}</strong>
            <span>凭据</span><strong>${localConfig.hasToken ? '已读取，不显示' : '缺失'}</strong>
          </div>`
        : ''
    }
    <p class="settings-note">读取自 ${esc(
      localConfig?.file || '~/.claude/settings.json'
    )}。凭据只在主进程读取，不会复制到本应用，也不会发送到渲染层。</p>
    <button class="lg-btn lg-btn--sm" type="button" data-action="reload-local-config">${icon(
      'refresh'
    )} 重新读取本机配置</button>
  </div>`;

  const proxyMode = settings.proxyMode || 'system';
  const proxyStatus = settings.proxyStatus || {};
  const proxyError = proxyStatus.error || '';
  const routeLabel = proxyRouteLabel(settings);

  return `<div class="lg-overlay" data-action="close-settings">
    <div class="lg-modal settings-modal" role="dialog" aria-modal="true" aria-label="设置">
      <div class="lg-modal-header">
        <span>设置</span>
        <button class="lg-icon-btn" type="button" data-action="close-settings" title="关闭">${icon(
          'close'
        )}</button>
      </div>
      <div class="lg-modal-body settings-scroll">
        <section class="settings-section">
          <h3>${icon('sparkle')} AI 精读</h3>
          <p class="settings-desc">选择「AI 精读」使用的服务，生成中文总结、关键要点、术语卡与延伸问题。不配置也可以使用完全离线的本地速读。</p>
          <div class="ai-providers" role="group" aria-label="AI 服务商">
            ${[
              ['local-claude', '跟随本机 Claude Code'],
              ['anthropic', 'Anthropic 官方'],
              ['deepseek', 'DeepSeek'],
              ['custom', '自定义接口'],
            ]
              .map(
                ([value, label]) =>
                  `<button class="ai-provider${aiProvider === value ? ' is-active' : ''}" type="button" data-action="ai-provider" data-provider="${value}">${esc(
                    label
                  )}</button>`
              )
              .join('')}
          </div>
          <p class="ai-provider-desc">${esc(providerDescs[aiProvider])}</p>
          ${
            aiProvider === 'local-claude'
              ? localBlock
              : `<div class="ai-field-row">
                  <label class="ai-field"><span>模型</span>
                    <input class="lg-input" id="settings-ai-model" type="text" value="${esc(
                      aiModel
                    )}" placeholder="${esc(modelPlaceholder)}" autocomplete="off" spellcheck="false" />
                  </label>
                  ${
                    aiProvider === 'custom'
                      ? `<label class="ai-field"><span>接口地址</span>
                          <input class="lg-input" id="settings-ai-base-url" type="text" value="${esc(
                            settings.aiBaseUrl || ''
                          )}" placeholder="http://127.0.0.1:11434/v1" autocomplete="off" spellcheck="false" />
                        </label>`
                      : ''
                  }
                  <button class="lg-btn" type="button" data-action="save-ai-config">保存配置</button>
                </div>
                ${
                  aiProvider === 'deepseek'
                    ? `<p class="settings-note">默认接口：https://api.deepseek.com/v1</p>`
                    : ''
                }
                <div class="key-status" style="margin-top:12px">${keyStatus}</div>
                <div class="settings-row">
                  <input class="lg-input" id="settings-api-key" type="password" placeholder="${
                    settings.hasApiKey ? '输入新的 Key 以替换' : keyPlaceholder
                  }" autocomplete="off" spellcheck="false" />
                  <button class="lg-btn lg-btn--primary" type="button" data-action="save-key">保存 Key</button>
                  ${
                    settings.hasApiKey
                      ? `<button class="lg-btn lg-btn--danger" type="button" data-action="clear-key">清除</button>`
                      : ''
                  }
                </div>
                <p class="settings-note">${esc(secureNote)}${keyHelp} 切换服务商后请确认 Key 与模型属于当前服务。</p>`
          }
          <div class="settings-inline news-digest-setting">
            <label class="settings-inline-label" for="auto-news-digest-toggle">今日 AI 概览
              <span>打开「今日热点」时自动整理当天重点；会把新闻标题与摘要发送给当前 AI 服务</span>
            </label>
            <label class="check-toggle"><input type="checkbox" id="auto-news-digest-toggle" ${
              settings.autoNewsDigest !== false ? 'checked' : ''
            } /> 启用</label>
          </div>
        </section>

        <section class="settings-section">
          <h3>${icon('globe')} 网络与代理</h3>
          <p class="settings-desc">RSS 抓取、正文抓取与 AI API 请求都在主进程通过 Chromium 网络栈发出。默认跟随系统代理；如果你使用 Clash、Surge 等工具但没有开启系统代理，可以在这里手动指定。</p>
          <div class="proxy-modes" role="group" aria-label="代理模式">
            <button class="proxy-mode${proxyMode === 'system' ? ' is-active' : ''}" type="button" data-action="proxy-mode" data-proxy-mode="system">跟随系统</button>
            <button class="proxy-mode${proxyMode === 'direct' ? ' is-active' : ''}" type="button" data-action="proxy-mode" data-proxy-mode="direct">直连</button>
            <button class="proxy-mode${proxyMode === 'manual' ? ' is-active' : ''}" type="button" data-action="proxy-mode" data-proxy-mode="manual">手动代理</button>
          </div>
          ${
            proxyMode === 'manual'
              ? `<div class="settings-row proxy-url-row">
                  <input class="lg-input" id="settings-proxy-url" type="text" value="${esc(
                    settings.proxyUrl || ''
                  )}" placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:7890" autocomplete="off" spellcheck="false" />
                  <button class="lg-btn lg-btn--primary" type="button" data-action="save-proxy">保存代理</button>
                </div>`
              : ''
          }
          <div class="settings-row proxy-test-row">
            <button class="lg-btn" type="button" data-action="test-network">${icon('globe')} 测试 claude.dev</button>
            <span class="proxy-test-status" id="proxy-test-status">当前：${esc(routeLabel)}</span>
          </div>
          ${proxyError ? `<p class="proxy-error">${esc(proxyError)}</p>` : ''}
          <p class="settings-note">修改后立即生效，代理只影响本应用，不会修改系统设置。AI API 请求也会经过同一代理。</p>
          <div class="direct-sources-block">
            <div class="direct-sources-head"><span>按来源路由</span><span>直连优先 · 失败回退代理</span></div>
            <div class="direct-sources">
              ${state.sources
                .map((source) => {
                  const forcedDirect = (settings.directSources || []).includes(source.id);
                  return `<label class="direct-source" title="${esc(source.title)}"><input type="checkbox" data-direct-source="${esc(
                    source.id
                  )}" ${forcedDirect ? 'checked' : ''} /><span class="direct-source-name">${esc(
                    source.name
                  )}</span><span class="direct-source-mode">${
                    forcedDirect ? '直连' : '自动'
                  }</span></label>`;
                })
                .join('')}
            </div>
            <p class="settings-note">不勾选 = 自动：先直连，约 1.2 秒内无响应再走上面的全局代理。勾选 = 强制直连，不再回退代理。修改后点击「立即同步」验证。</p>
          </div>
        </section>

        <section class="settings-section">
          <h3>${icon('refresh')} 同步与缓存</h3>
          <p class="settings-desc">启动时以及每 30 分钟自动抓取一次来源更新。抓取结果保存在本机，断网时仍可阅读。</p>
          <div class="settings-inline">
            <label class="settings-inline-label" for="auto-refresh-toggle">自动同步
              <span>每 30 分钟刷新全部信息源</span>
            </label>
            <label class="check-toggle"><input type="checkbox" id="auto-refresh-toggle" ${
              settings.autoRefresh ? 'checked' : ''
            } /> 启用</label>
          </div>
          <div class="settings-row" style="margin-top:8px">
            <button class="lg-btn" type="button" data-action="refresh">${icon('refresh')} 立即同步</button>
            <button class="lg-btn" type="button" data-action="clear-read">${icon('eye')} 清除阅读记录</button>
            <button class="lg-btn lg-btn--danger" type="button" data-action="clear-cache">${icon(
              'trash'
            )} 清除资讯缓存</button>
          </div>
        </section>

        <section class="settings-section">
          <h3>${icon('book')} 阅读与词典</h3>
          <p class="settings-desc">阅读文章时双击英文单词，即可查询 Cambridge 的英英释义与英汉翻译。查询在主进程完成，结果缓存在本机 30 天。</p>
          <div class="settings-inline">
            <label class="settings-inline-label" for="dictionary-toggle">双击英文查词
              <span>英英 + 英汉 · 按需查询，不预取、不批量抓取</span>
            </label>
            <label class="check-toggle"><input type="checkbox" id="dictionary-toggle" ${
              state.ui.dictionaryOn ? 'checked' : ''
            } /> 启用</label>
          </div>
          <div class="settings-row" style="margin-top:8px">
            <button class="lg-btn" type="button" data-action="clear-dictionary">${icon(
              'trash'
            )} 清除词典缓存</button>
            <span class="proxy-test-status" id="dictionary-status">Cambridge Dictionary · 英英 / 英汉</span>
          </div>
          <p class="settings-note">Oxford Learner's Dictionaries 未提供免费公开接口，且其 robots 规则不允许自动抓取，因此词典来源使用 Cambridge；英英释义在 Cambridge 不可用时回退到 Wiktionary。</p>
        </section>

        <section class="settings-section">
          <h3>${icon('palette')} 外观</h3>
          <p class="settings-desc">八套主题共享同一套玻璃物理规则，只替换表面、主色与环境光；纯黑与黑灰额外提供灰度调节。外观面板与这里的所有开关共用同一份状态。</p>
          <div class="theme-grid" role="radiogroup" aria-label="主题">${themeOptions(state.theme, 'app-theme-option')}</div>
          <div class="settings-inline font-setting-row">
            <label class="settings-inline-label" for="settings-glass-alpha">玻璃强度
              <span>只调整工具栏、面板与侧栏等浮层 · <span id="settings-glass-alpha-value">${state.glassAlpha}%</span></span>
            </label>
            <input class="lg-slider" id="settings-glass-alpha" type="range" min="0" max="100" step="1" value="${state.glassAlpha}" data-glass-alpha aria-label="玻璃强度" />
          </div>
          <div class="settings-inline font-setting-row${
            state.theme === 'black' || state.theme === 'graphite' ? '' : ' is-disabled'
          }">
            <label class="settings-inline-label" for="settings-theme-gray">灰度
              <span>纯黑 / 黑灰主题的明暗 · <span id="settings-theme-gray-value" data-theme-gray-value>${
                state.theme === 'black' || state.theme === 'graphite'
                  ? state.themeGray[state.theme] ?? 3
                  : '—'
              }</span></span>
            </label>
            <input class="lg-slider" id="settings-theme-gray" type="range" min="0" max="20" step="1" value="${
              state.theme === 'black' || state.theme === 'graphite'
                ? state.themeGray[state.theme] ?? 3
                : 3
            }" data-theme-gray ${
              state.theme === 'black' || state.theme === 'graphite' ? '' : 'disabled'
            } aria-label="灰度" />
          </div>
          <div class="settings-inline">
            <label class="settings-inline-label" for="settings-optical-toggle">光学折射玻璃
              <span>WebGL2 实时折射、色散与指针高光；关闭后回到 CSS 玻璃</span>
            </label>
            <label class="check-toggle"><input type="checkbox" id="settings-optical-toggle" data-optical-toggle ${
              state.opticalGlass !== false ? 'checked' : ''
            } /> <span>${state.opticalGlass !== false ? '开启' : '关闭'}</span></label>
          </div>
          <div class="settings-inline glass-bg-setting">
            <label class="settings-inline-label">光学玻璃背景
              <span>WebGL 光学层的环境 · 纯色没有可折射的细节</span>
            </label>
            <div class="proxy-modes" role="group" aria-label="光学玻璃背景">
              ${GLASS_BACKGROUNDS.map(
                (mode) =>
                  `<button class="proxy-mode${
                    glassBackground === mode.id ? ' is-active' : ''
                  }" type="button" data-action="glass-background" data-glass-background="${
                    mode.id
                  }">${esc(mode.label)}</button>`
              ).join('')}
            </div>
          </div>
          <div class="settings-inline">
            <label class="settings-inline-label" for="settings-glass-animation">背景漂移
              <span>让柔光渐变、光学标定与内置图片缓慢流动</span>
            </label>
            <label class="check-toggle"><input type="checkbox" id="settings-glass-animation" data-glass-animation ${
              state.glassAnimation ? 'checked' : ''
            } /> 启用</label>
          </div>
          <div class="settings-row" style="margin-top:8px">
            <button class="lg-btn" type="button" data-action="open-glass-params">${icon(
              'sliders'
            )} 材质与光效参数</button>
            <span class="proxy-test-status">18 项材质、阴影、边缘高光与反射参数</span>
          </div>
          <p class="settings-note">柔光渐变跟随当前主题生成大色场；光学标定显示同心环、点阵与制图线，折射最明显；主题纯色只保留 tint、边缘高光与指针高光；内置图片使用与主题匹配的光学标定图。</p>
          <div class="settings-inline font-setting-row">
            <label class="settings-inline-label" for="settings-font-slider">阅读字号
              <span>仅影响文章正文 · <span id="settings-font-value">${readerFontSize}px</span></span>
            </label>
            <input class="lg-slider" id="settings-font-slider" type="range" min="14" max="24" step="1" value="${readerFontSize}" aria-label="阅读字号" />
          </div>
          <div class="settings-inline font-setting-row">
            <label class="settings-inline-label" for="settings-width-slider">阅读宽度
              <span>正文栏宽 · <span id="settings-width-value">${state.ui.readerColumnWidth || 760}px</span></span>
            </label>
            <input class="lg-slider" id="settings-width-slider" type="range" min="520" max="1100" step="10" value="${state.ui.readerColumnWidth || 760}" aria-label="阅读宽度" />
          </div>
          <p class="settings-note">阅读器右上角的「Aa」也可以随时调整字号与宽度。居中阅读时拖动阅读框右下角可调整窗口大小；全屏阅读时拖动正文右侧的竖条可调整阅读宽度；分栏阅读时拖动中间分隔条可调整栏宽。尺寸会保存在本机。</p>
        </section>

        <section class="settings-section">
          <h3>${icon('book')} 关于</h3>
          <div class="settings-about">
            <span><strong>前沿雷达 Frontier Radar</strong> · v${esc(state.appInfo.version || '1.0.0')}</span>
            <span>${state.sources.length} 个信息源 · 本地优先 · 液态玻璃界面</span>
            <span>数据目录：${esc(state.appInfo.dataPath || '未知')}</span>
            <span>Claude 专区：<a data-external="https://claude.dev/">claude.dev</a> · 使用 Anthropic API 时请遵守其使用政策</span>
          </div>
        </section>
      </div>
      <div class="lg-modal-footer">
        <button class="lg-modal-btn" type="button" data-action="close-settings">关闭</button>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Entry points                                                        */
/* ------------------------------------------------------------------ */

export function renderMain() {
  switch (state.view) {
    case 'news':
      return renderNewsView();
    case 'claude':
      return renderClaudeView();
    case 'saved':
    case 'all':
      return renderFeedView();
    case 'notes':
      return renderNotesView();
    case 'overview':
    default:
      return renderOverview();
  }
}

export function renderFontPopover(position = {}) {
  const size = state.ui.readerFontSize || 17;
  const columnWidth = state.ui.readerColumnWidth || 760;
  const style = `top:${Math.round(position.top || 64)}px;right:${Math.round(
    position.right || 16
  )}px;`;
  return `<div class="lg-popover font-popover" style="${esc(
    style
  )}" role="dialog" aria-label="阅读排版">
    <div class="lg-popover-title">阅读排版</div>
    <div class="font-size-row">
      <button class="font-step" type="button" data-action="font-step" data-delta="-1" aria-label="减小字号" ${
        size <= 14 ? 'disabled' : ''
      }>A−</button>
      <span class="font-size-value" id="font-size-value" aria-live="polite">${size}px</span>
      <button class="font-step" type="button" data-action="font-step" data-delta="1" aria-label="增大字号" ${
        size >= 24 ? 'disabled' : ''
      }>A+</button>
    </div>
    <input class="lg-slider font-slider" id="font-size-slider" type="range" min="14" max="24" step="1" value="${size}" aria-label="阅读字号" />
    <div class="font-scale"><span>14</span><span>24</span></div>
    <div class="font-preview" id="font-preview" style="font-size:${size}px">正文预览 · 前沿技术</div>
    <div class="font-divider"></div>
    <div class="font-width-row">
      <span class="font-label">阅读宽度</span>
      <span class="font-width-value" id="reader-width-value" aria-live="polite">${columnWidth}px</span>
    </div>
    <input class="lg-slider font-slider" id="reader-width-slider" type="range" min="520" max="1100" step="10" value="${columnWidth}" aria-label="阅读宽度" />
    <div class="font-scale"><span>窄</span><span>宽</span></div>
    <button class="lg-btn lg-btn--sm font-reset" type="button" data-action="font-reset">恢复默认 17px / 760px</button>
  </div>`;
}

export function renderOverlay(
  themePosition = null,
  fontPosition = null,
  paramsPosition = null
) {
  if (state.ui.modal === 'settings') return renderSettingsModal();
  let html = '';
  if (state.ui.digestOpen) {
    html += renderDigestOverlay();
  } else if (state.ui.activeItem && state.ui.readerLayout !== 'split') {
    html += renderReader();
  }
  if (state.ui.themeOpen) html += renderThemePopover(themePosition || {});
  if (state.ui.glassParamsOpen) html += renderGlassParamsPanel(paramsPosition || {});
  if (state.ui.fontOpen) html += renderFontPopover(fontPosition || {});
  if (state.ui.dictionary) html += renderDictionaryPopover();
  return html;
}

export function viewTitle() {
  if (state.view === 'news') {
    if (state.sourceFilter !== 'all') {
      return (
        state.sources.find((source) => source.id === state.sourceFilter)?.name || '今日热点'
      );
    }
    return '今日热点';
  }
  if (state.view === 'claude') return 'Claude 专区';
  if (state.view === 'saved') return '收藏夹';
  if (state.view === 'notes') return '学习笔记';
  if (state.view === 'all') {
    if (state.sourceFilter !== 'all') {
      return state.sources.find((source) => source.id === state.sourceFilter)?.name || '资讯';
    }
    return '全部资讯';
  }
  return '概览';
}

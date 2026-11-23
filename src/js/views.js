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

const THEME_OPTIONS = [
  { id: 'aurora', label: '极光' },
  { id: 'ocean', label: '深海' },
  { id: 'forest', label: '森林' },
  { id: 'ember', label: '余烬' },
  { id: 'violet', label: '紫罗兰' },
  { id: 'light', label: '浅色' },
];

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

function isLowSignal(item) {
  return (
    item.sourceId === 'hn' &&
    /(is hiring|who is hiring)/i.test(String(item.title || ''))
  );
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

  const navItems = [
    { view: 'overview', label: '概览', iconName: 'overview', count: null },
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

  return `
    <nav class="side-nav" aria-label="主要导航">
      ${navItems
        .map((entry) => {
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
        })
        .join('')}
    </nav>

    <div class="side-section">
      <div class="side-label"><span>资讯源</span><span>${state.sources.length}</span></div>
      ${state.sources
        .filter((source) => source.id !== 'claude')
        .map((source) => {
          const active = state.view === 'all' && state.sourceFilter === source.id;
          const error = state.feeds[source.id]?.error;
          return `<button class="source-row${active ? ' is-active' : ''}" type="button" data-source-filter="${esc(
            source.id
          )}" title="${esc(`${source.title} · ${source.subtitle}`)}">
            <span class="source-mark">${esc(source.mark)}</span>
            <span class="source-name">${esc(source.name)}</span>
            ${error ? `<span class="source-error-dot" title="${esc(error)}"></span>` : ''}
            <span class="source-count">${counts[source.id] || 0}</span>
          </button>`;
        })
        .join('')}
    </div>

    <div class="side-footer">
      <div class="sync-row">
        <span class="sync-dot ${syncDotClass}"></span>
        <span>${esc(syncLabel(state.updatedAt))}</span>
      </div>
      <div>${unread ? `${unread} 条未读 · ` : ''}${state.settings.autoRefresh ? '每 30 分钟自动同步' : '手动同步'}</div>
      <div style="opacity:.6">本地缓存 · 离线可读 · v${esc(state.appInfo.version || '1.0.0')}</div>
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
      return loadingView('正在捕获第一批信号…', '首次启动会同时抓取 8 个信息源。');
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
  const focusItems = items.filter((item) => !isLowSignal(item));
  const lead = pickHomeLead(items);
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
    : `把 ${state.sources.length} 个前沿信息源汇成一条信息流，可在「混合」与「最新」之间切换，支持搜索与只看未读。`;

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
    }" type="button" data-theme-option="${theme.id}" title="${esc(theme.label)}">
      <span class="theme-swatch" data-swatch="${theme.id}"></span>
      <span>${esc(theme.label)}</span>
    </button>`
  ).join('');
}

export function renderThemePopover(position = {}) {
  const style = `top:${Math.round(position.top || 64)}px;right:${Math.round(position.right || 16)}px;`;
  return `<div class="lg-popover theme-popover" style="${esc(style)}" role="menu" aria-label="外观主题">
    <div class="lg-popover-title">外观主题</div>
    <div class="popover-theme-grid">${themeOptions(state.theme, 'lg-theme-option')}</div>
    <div class="lg-popover-hint">主题与玻璃质感会立即应用，并记住你的选择。</div>
  </div>`;
}

export function renderSettingsModal() {
  const settings = state.settings;
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
          <h3>${icon('palette')} 外观</h3>
          <p class="settings-desc">六套主题共享同一套玻璃物理规则，只替换表面、主色与环境光。</p>
          <div class="theme-grid">${themeOptions(state.theme, 'app-theme-option')}</div>
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

export function renderOverlay(themePosition = null, fontPosition = null) {
  if (state.ui.modal === 'settings') return renderSettingsModal();
  let html = '';
  if (state.ui.activeItem && state.ui.readerLayout !== 'split') html += renderReader();
  if (state.ui.themeOpen) html += renderThemePopover(themePosition || {});
  if (state.ui.fontOpen) html += renderFontPopover(fontPosition || {});
  return html;
}

export function viewTitle() {
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

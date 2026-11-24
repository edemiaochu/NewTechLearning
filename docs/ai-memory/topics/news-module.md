---
name: news-module
description: 今日热点新闻模块：当天范围、跨来源事件聚合、关键词、世界要闻与来源筛选
type: topic
updated: 2026-11-24
related: [[sources-feeds]], [[ai-deep-read]], [[caching-persistence]], [[networking-proxy]]
---

# 今日热点新闻

## 当前实现

- 侧栏新增「今日热点」导航，独立视图 `news`；打开后按本地当天聚合新闻（少于 6 条时回退近 24 小时，标签显示「近 24 小时」，再空则回退「最新」）。
- 新闻源共 10 个参与聚合：HN、MIT Tech Review、The Verge（已在资讯源中）+ TechCrunch、Ars Technica、WIRED、IT之家、爱范儿、NPR World、France 24。
- 侧栏「新闻源」单独列出 7 个新增来源；点击来源进入 `news` 视图并筛选该来源，不跳回「全部资讯」。
- 顶部概览：今日头条、今日新闻数、新闻源数、多源热点数、世界要闻数、今日关键词。
- 事件聚合：标题分词后做重叠聚类；要求至少 2 个有效词重合且覆盖率 ≥0.4，避免泛词误合并。事件按「覆盖媒体数 × 400 + 社区热度 + 新鲜度」排序。
- 新闻流：世界要闻（`world: true`）与科技新闻分流；其余按发布时间倒序，最多展示 80 条。
- 新闻搜索复用顶部搜索：在 `news` 视图内搜索全部已缓存新闻，不离开模块。
- 关键词：从标题抽取跨来源高频词，过滤通用词与停用词。
- AI 今日概览（置顶）：
  - 打开未筛选的 `news` 视图且当天新闻指纹变化时自动生成；只发送标题/来源/摘要，不发送全文。
  - 概览含 headline、overview、3–6 条 highlights（可点击打开对应文章）、themes、watch。
  - 生成结果存 `fr.newsDigest`，指纹 = 当天新闻 ID 哈希 + AI 服务商/模型；指纹一致不重复调用。
  - 自动整理可用设置 `autoNewsDigest` 关闭；关闭后仍可手动生成。
  - 解析失败自动重试一次，仍失败保留旧缓存并显示错误/重试；指纹不同的旧概览不展示。
  - 只在不筛选/不搜索的新闻总览中显示；单来源筛选时隐藏。
  - 支持全屏阅读：复用 `reader-overlay--fullscreen` 外壳，`state.ui.digestOpen` 控制；Esc / 背景 / 关闭按钮退出，点击重点条目会关闭概览并打开文章。
  - 支持导出 Markdown 与白底 A4 PDF；概览中的重点若关联到候选条目，导出时会带上原报道链接。

## 关键文件

- `lib/sources.js` — `news` / `newsSection` / `world` 标记与 7 个新来源
- `src/js/news.js` — `selectScope`、`buildHotEvents`、`keywordsOf`、`newsItems`、`digestFingerprint`
- `src/js/views.js` — `renderNewsView`、事件卡、新闻行、来源筛选、关键词、AI 概览卡片与全屏阅读
- `src/js/app.js` — `news` 视图白名单、`setNewsSourceFilter`、`maybeAutoNewsDigest` / `generateNewsDigest`、`openDigestFullscreen`
- `lib/ai.js` — `summarizeNewsDigest`、新闻概览 prompt 与 JSON 解析
- `lib/pdf.js` — `renderNewsDigestHtml` / `exportNewsDigestPdf`
- `preload.js` / `main.js` — `news:digest`、`news:export-digest`、`pdf:export-news-digest` IPC
- `src/js/state.js` — 视图持久化允许 `news`
- `src/styles/app.css` — `.news-hero`、`.news-event-*`、`.news-stream`、`.news-row`

## 约束与坑

- 事件聚合是轻量标题启发式，不做跨语言语义匹配；中英文报道同一事件通常不会合并。
- 停用词在 `src/js/news.js`：新增来源或发现误合并时优先补词，而不是提高阈值（提高阈值会漏掉同一事件）。
- 「今日」按本地日历日计算；清晨或时区差异导致内容少时自动回退近 24 小时，UI 必须同步标签。
- 新闻源多为境外站点，失败时保留旧缓存并在来源行显示错误点；代理设置在「网络与代理」。
- 新闻条目与其他来源共用 `allItems()`、正文缓存、已读/收藏/笔记；文章 ID 规则不变。
- 概览「今日焦点」排除 `world: true` 世界要闻，避免首页被非科技新闻稀释；新闻模块仍完整展示。
- AI 概览必须按指纹去重：不要在 render 中直接无保护地调用 AI，否则每次重渲染都会产生费用并可能循环。
- `newsDigestAttemptKey` 只在当前会话阻止失败重试；手动「重新整理」或切换 AI 配置会重置。
- AI 概览缓存仅保留一份；指纹不匹配即视为过期，不删除旧数据也可，但不要展示。

## 未决问题

- 是否需要按主题（AI / 芯片 / 安全 / 融资）给新闻流分类。
- 是否需要事件详情页，列出同一事件下所有媒体的报道链接。
- 是否需要新闻源的独立自动刷新频率（当前与全部来源一起刷新）。
- 是否需要给 AI 概览增加「只保留要点、隐藏详情」的折叠态，减少首屏高度。

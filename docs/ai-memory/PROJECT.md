---
name: project-overview
description: 液态玻璃风格的前沿技术学习 Electron 桌面应用，聚合 15 个信息源并提供 Claude 专区、今日热点与 AI 今日概览（全屏/导出）、AI 精读、画笔与 PDF
type: project
updated: 2026-11-24
---

# 前沿雷达 Frontier Radar

## 是什么

一款面向中文读者的前沿技术学习桌面应用：抓取 claude.dev、OpenAI、DeepMind、arXiv、Hacker News 等 8 个技术来源，以及 TechCrunch、Ars Technica、WIRED、IT之家、爱范儿、NPR、France 24 等 7 个新闻源；提供 Claude 专区、今日热点、站内阅读、本地速读、可选 AI 精读、画笔标注、笔记与 PDF 导出。

## 技术栈与命令

- Electron 45.4.1（Node 22）
- 原生 HTML + CSS + ES Module，无 bundler
- `@anthropic-ai/sdk`、`cheerio`、`fast-xml-parser`
- 运行：`npm start`
- 开发：`npm run dev`（打开 DevTools）
- 资产：`npm run icon`、`npm run cursor`
- 构建/测试/打包：未配置

## 目录地图

- `main.js` — 主进程：窗口、IPC、代理 session、源路由、PDF、同步
- `preload.js` — contextBridge 最小 API
- `lib/sources.js` — 15 个信息源注册表；`news` / `newsSection` / `world` 标记新闻模块来源
- `lib/feeds.js` — RSS/Atom 抓取、解析、条件请求、合并与缓存
- `lib/article.js` — HTML / claude.dev Markdown / arXiv 摘要正文抽取
- `lib/article-store.js` — 正文持久化缓存（60 篇）
- `lib/summarize.js` — 本地抽取式摘要、关键词、阅读时长
- `lib/ai.js` — Anthropic SDK 与 OpenAI 兼容 AI 精读 + 新闻概览
- `lib/local-claude.js` — 读取本机 Claude Code 配置（凭据不出主进程）
- `lib/net.js` — Chromium `net.fetch`、代理/直连 session、auto 路由探测
- `lib/settings.js` — safeStorage Key、代理、来源路由、AI 配置
- `lib/pdf.js` — 隐藏窗口 `printToPDF`、白底 A4 模板、AI 概览 Markdown/PDF 模板
- `src/js/` — 渲染层状态、视图、事件、主题
- `src/styles/` — Liquid Glass tokens/组件 + 应用层样式
- `scripts/` — 图标与画笔光标生成
- `docs/ai-memory/` — 项目记忆（本目录）

## 架构与数据流

1. 渲染层通过 preload 暴露的 `window.radar` 调用 IPC；渲染层不直接发网络请求。
2. 主进程 `FeedService` 抓取来源，`ArticleStore` 先查正文缓存，再按需抓取。
3. 网络使用两个 Chromium session：默认 session（全局代理）+ `persist:frontier-direct`（强制直连）。
4. 来源路由为 `direct` / `proxy` / `auto`：auto 先直连 HEAD 探测，1.2 秒无响应回退代理；按主机缓存 5 分钟。
5. AI 精读通过 Anthropic SDK（本机 Claude Code 配置或官方）或 OpenAI 兼容 `/chat/completions`；AI 摘要存 localStorage，可独立于正文显示。
6. AI 今日概览复用同一 AI 通道：按新闻指纹缓存 `fr.newsDigest`，打开今日热点且指纹变化时自动生成；可关闭自动整理；支持全屏阅读与 Markdown/PDF 导出。
7. PDF 在隐藏 `BrowserWindow` 中加载白底模板后 `printToPDF`。

## 约定与坑

- 所有网络在**主进程**完成；渲染层 CSP 禁止 `connect-src`。
- 远端文本必须先转义再渲染；文章链接只允许 `http(s)`。
- 颜色只能来自 `--token`；玻璃仅用于浮动操作层，正文卡片用实色表面。
- 不要把 API Key/本机 Claude Code token 传给渲染层；Key 用 `safeStorage`。
- 来源缓存 `updatedAt` 只有至少一个来源成功才推进，避免全失败后不重试。
- 打开过的文章正文持久化；AI 摘要与正文缓存独立，正文失败时 AI 卡片仍显示。
- `directSources` 语义是**强制直连**；未勾选是 `auto`，不是 proxy。
- 直连探测为 HEAD：只接受 GET 的站点可能被误判，手动勾「直连」即可。
- 阅读器文章正文用 `#reader-content` 局部更新，不要整块重建，否则会闪烁/丢笔记焦点。
- 「今日热点」先取本地当天；少于 6 条时自动回退到近 24 小时并改标签，不要假装是当天。
- 新闻事件聚合是标题词重合的启发式；通用词（ai、tech、公司、发布…）已在 `news.js` 的停用词中剔除，新增来源时注意别让泛词造成误合并。
- AI 今日概览只发送新闻标题/来源/摘要（不发全文）；默认自动，设置项 `autoNewsDigest` 可关闭。
- 概览缓存键包含当天新闻 ID 指纹 + AI 服务商/模型；任一变化才重新生成，避免重复调用。
- 概览 JSON 解析失败会自动重试一次；仍失败保留旧缓存并显示错误/手动重试，不要无限重试或循环自动生成。

## 关键入口

- `main.js` — IPC `feeds:*`、`article:load`、`ai:summarize`、`news:digest`、`news:export-digest`、`pdf:*`、`net:test`
- `src/js/app.js` — 应用编排、布局、画笔、路由 UI、AI 概览自动生成/全屏/导出、AI/PDF 触发
- `src/js/views.js` — 首页/今日热点/AI 概览与全屏阅读/Claude/阅读器/设置/PDF 按钮等渲染
- `src/js/news.js` — 当天范围、跨来源事件聚合、关键词、新闻选择器与概览指纹
- `src/js/state.js` — 本地状态与 localStorage 持久化
- `lib/net.js` — `fetchText` 的 `auto/direct/proxy` 路由

## 已知限制

- 未配置 electron-builder/Forge，安装包未生成。
- AI 精读/概览已通过本机 DeepSeek Anthropic 兼容端点做真实调用验证；Anthropic 官方付费 Key 仍未验证。
- AI 今日概览依赖模型的 JSON 输出能力；已加一次重试，仍可能偶发失败。
- 部分站点有付费墙/反爬，正文可能抽取失败；会回退来源摘要。
- 第一次打开文章仍需网络；成功打开后才进入正文缓存。
- AI API 请求目前仍走全局代理，不受按来源直连影响。

---
name: networking-proxy
description: 全局代理、独立直连 session、按来源 auto/direct 路由与探测缓存
type: topic
updated: 2026-11-23
related: [[sources-feeds]], [[ai-deep-read]]
---

# 网络与代理

## 当前实现

- 主进程使用 Electron Chromium 网络栈；渲染层 CSP 禁止网络。
- 两个 session：
  - 默认 session — 全局代理：system / direct / manual HTTP 或 SOCKS5
  - `persist:frontier-direct` — `setProxy({ mode: 'direct' })`，来源强制直连
- 全局代理在启动时由 `applyProxyConfig` 应用；`resolveProxy('https://claude.dev/')` 结果用于状态展示。
- 按来源路由 `sourceRoute(sourceId)`：
  - 全局模式为 `direct` 或系统解析为 `DIRECT` → `direct`
  - 来源在 `directSources` 中 → `direct`（强制，不回退）
  - 其它 → `auto`
- `auto`（默认，未勾选）：
  1. 对 URL 主机做 HEAD 直连探测，超时约 1.2 秒
  2. 探测结果按主机缓存 5 分钟
  3. 可达 → 直连 GET；不可达 → 全局代理
  4. 直连 GET 失败 → 标记主机不可达并回退代理
- 头部探测接受 `<400` 或 `405`（HEAD 不被允许但主机可达）；403/429/5xx 视为不可直连。
- 文章正文与资讯列表使用同一来源路由；正文缓存命中时完全不触网。
- 测试按钮 `net:test` 走 `fetchText` 的实际路由（Claude 被强制直连时会走直连）。
- 结果验证：
  - 系统代理正常：8/8 来源成功，auto 路由混合直连/代理
  - 全局代理坏 + 强制直连 arXiv/HN：两源成功，arXiv 正文 direct 打开
  - 坏代理 + 全部 auto：可直连站点成功，需代理站点失败（符合预期）

## 关键文件

- `lib/net.js` — `getFetch(route)`、直连 session、HEAD 探测、`fetchText` auto 回退
- `lib/feeds.js` — `routeForSource` 用于来源抓取
- `lib/article.js` — article markdown/HTML 抓取接收 `route`
- `main.js` — session 初始化、`sourceRoute`、article/测试路由
- `lib/settings.js` — proxyMode/proxyUrl/directSources
- `src/js/views.js` / `app.js` — 按来源路由 UI

## 约束与坑

- `directSources` 是**强制直连**；未勾选是 auto，不是 proxy。
- 直连探测是 HEAD；只接受 GET 的站点可能误判，手动勾「直连」。
- 探测缓存按 hostname，不区分端口/路径；5 分钟内沿用判断。
- 切换来源路由后不会自动重新抓取；需要点「立即同步」。
- AI API 请求仍用默认 session 的全局代理；按来源直连不影响 AI。
- 探测/直连 GET 都会走独立 session；它不复用默认 session 的 cookie。

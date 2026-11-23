---
name: caching-persistence
description: 资讯/正文/AI/笔记/画笔/已读的本地持久化与清理语义
type: topic
updated: 2026-11-23
related: [[sources-feeds]], [[ai-deep-read]], [[networking-proxy]]
---

# 缓存与持久化

## 当前实现

- 资讯缓存：`<userData>/feed-cache.json`
  - 每个来源：items、etag、lastModified、fetchedAt、checkedAt、error
  - 合并新旧条目，按发布时间排序，按来源上限截断
- 正文缓存：`<userData>/article-cache.json`
  - `ArticleStore`，最多 60 篇，按 cachedAt 淘汰
  - 存 blocks、text、summary、标题/作者/元数据、extractedWith、cachedAt
  - 读取时返回 `ok: true, fromCache: true`；命中 0ms，不触网
- localStorage：
  - `fr.read` 已读、`fr.saved` 收藏
  - `fr.notes` 学习笔记
  - `fr.ai` AI 精读摘要（最多 30 条）
  - `fr.ink` 画笔笔迹（最多 40 篇，单篇 160 笔、500 点/笔）
  - 主题/阅读布局/宽度/字号/来源直连等偏好
- AI 摘要与正文缓存相互独立；正文抓取失败时 AI 卡片仍显示。
- `updatedAt` 只在至少一个来源成功时推进；全部失败则下次启动仍会重试。
- 「清除资讯缓存」：
  - 清 feed-cache + article-cache + 内存 articleCache
  - 不清收藏、已读、笔记、AI 摘要、画笔
- Key 不在上述缓存中：safeStorage 加密的 settings.json。

## 关键文件

- `lib/feeds.js` — feed cache 合并/推进/保存
- `lib/article-store.js` — 正文持久化 LRU + inflight 去重
- `lib/settings.js` — 设置与 Key
- `src/js/state.js` — localStorage 读写、AI/画笔/prune
- `main.js` — cache 文件路径、`feeds:clear` 同时清正文

## 约束与坑

- 正文缓存只保存成功抽取的文章；第一次打开仍需网络。
- 文章 ID 是 `sourceId + link` 哈希，必须稳定。
- 正文缓存文本上限 80k 字符；blocks 仍可能较大，整体按 60 篇控制。
- localStorage 容量有限；AI/画笔有 prune，笔记无上限但通常很小。
- 清理 feed 缓存会清正文，但不会清 AI/笔记/已读；这是有意设计。
- 缓存的文章 markdown/HTML 是结构化 blocks，渲染前仍需转义。

## 未决问题

- 是否增加「清空 AI 摘要」「清空画笔」独立入口。
- 是否按时间（如 30 天）淘汰正文缓存，而不只是按数量。
- 是否支持导出/备份全部学习数据。

---
name: sources-feeds
description: 15 个信息源注册、RSS/Atom 抓取、正文抽取、摘要与首页排序
type: topic
updated: 2026-11-24
related: [[caching-persistence]], [[networking-proxy]], [[news-module]]
---

# 信息源与抓取

## 当前实现

- 15 个来源：8 个技术来源（claude.dev、OpenAI News、Google DeepMind、Google AI、arXiv cs.AI、Hacker News、MIT Technology Review、The Verge）+ 7 个新闻源（TechCrunch、Ars Technica、WIRED、IT之家、爱范儿、NPR World、France 24）。
- 新闻源标记：`news: true` 进入「今日热点」聚合；`newsSection: true` 在侧栏「新闻源」单独列出；`world: true` 进入「世界要闻」。HN / MIT TR / Verge 只带 `news: true`，仍留在「资讯源」。
- `FeedService`：并行抓取、条件请求（ETag/Last-Modified）、超时重试、来源级错误隔离、旧条合并去重。
- 每来源条数限制：claude/OpenAI/DeepMind/GoogleAI/TechCrunch/IT之家 20，arXiv 12，HN 18，MIT/Verge 12，Ars 18，WIRED/爱范儿 16，NPR/France24 12，防止单一来源刷屏。
- `claude.dev` 优先 `/blog/<slug>.md` 官方 Markdown；失败再走 HTML。
- arXiv `/abs/` 页面定制解析，只取摘要与学科分类，避免页面导航噪音。
- 通用正文抽取：cheerio 选择候选容器，转成 blocks（标题/段落/列表/引用/代码/分隔线），所有远端文本转义。
- HN 额外提取热度/评论数，并在无摘要时补域名与热度。
- 首页「今日焦点」按来源多样性挑选；HN 招聘帖从首页 lead/focus 中过滤。
- 摘要：本地抽取式总结（中英文），阅读时长按英文词+中文字折算。

## 关键文件

- `lib/sources.js` — 来源注册表与站点信息
- `lib/feeds.js` — 抓取、XML 解析、条目规范化、合并/缓存
- `lib/article.js` — 正文抽取、claude Markdown、arXiv 摘要
- `lib/summarize.js` — 本地摘要、关键词、阅读时长
- `lib/net.js` — `fetchText` 的代理/直连/auto 路由
- `src/js/news.js` — 今日范围、事件聚合与新闻关键词（见 [[news-module]]）

## 约束与坑

- RSS/Atom 结构会变；新增/失效来源改 `lib/sources.js`。
- 抓取失败应保留旧缓存并把 error 放到对应来源，不要清空旧内容。
- `feed-cache.updatedAt` 只有至少一个来源成功才更新；否则下次启动不会自动重试。
- 正文抽取失败是正常情况（付费墙/反爬），回退来源摘要并提供原文链接。
- 文章 ID 基于 `sourceId + link` 的 hash；刷新后要稳定，否则 AI/笔记/画笔会失联。

## 未决问题

- 是否需要来源自定义（用户添加 RSS）。
- 是否为 HN 外链单独做域名级路由/摘要策略。

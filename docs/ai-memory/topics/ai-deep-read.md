---
name: ai-deep-read
description: 多服务商 AI 精读、AI 今日概览、本机 Claude Code 配置、Key 安全与摘要缓存
type: topic
updated: 2026-11-24
related: [[caching-persistence]], [[networking-proxy]], [[news-module]]
---

# AI 精读

## 当前实现

- 四种服务商，默认 `local-claude`：
  1. `local-claude` — 读取 `~/.claude/settings.json` 的 `env`，自动跟随 Claude Code 当前端点/模型
  2. `anthropic` — 官方 Messages API，默认 `claude-opus-5-5`
  3. `deepseek` — 原生 OpenAI 兼容，默认 `https://api.deepseek.com/v1` + `deepseek-chat`
  4. `custom` — 任意 OpenAI 兼容接口（Ollama/LM Studio/中转）
- 本机配置读取：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY`、`ANTHROPIC_MODEL`；每次请求重新读取，改配置后自动跟随。
- 本机 token 只在主进程读取，不复制到应用设置、不传渲染层、不写日志。
- 其它服务的 Key 用 Electron `safeStorage` 加密；不支持安全存储时仅内存保留。
- Anthropic 官方模式启用服务端拒答回退；非官方兼容端点不发送 Anthropic 专属 beta 参数。
- OpenAI 兼容调用统一 `/chat/completions`，支持自定义 base URL。
- 摘要结果存 localStorage `fr.ai`；阅读器在正文加载中/失败时也会显示已缓存的 AI 卡片。
- AI 摘要展示：tldr、关键要点、为什么值得关注、术语卡、延伸问题、难度、模型/服务商与 usage。
- AI 今日概览：与单篇精读共用 provider 配置，`lib/ai.js` 的 `summarizeNewsDigest` 生成 headline/overview/highlights/themes/watch；只发送新闻标题/来源/摘要，不发全文；结果存 `fr.newsDigest`；可设置关闭自动整理；支持导出 Markdown 与 PDF。详见 [[news-module]]。

## 关键文件

- `lib/ai.js` — 提供商解析、Anthropic SDK/OpenAI 兼容请求、单篇/新闻概览 prompt 与 JSON 解析
- `lib/local-claude.js` — 本机 Claude Code 配置读取与脱敏元数据
- `lib/settings.js` — AI 配置、safeStorage Key、`autoNewsDigest`
- `main.js` — `ai:summarize` / `news:digest` IPC 与 settings snapshot
- `src/js/app.js` — AI 概览自动生成、缓存指纹与重试控制
- `src/js/views.js` — AI 卡片、AI 精读设置区、今日概览卡片

## 约束与坑

- 本机配置中的 `ANTHROPIC_MODEL` 可能不是 Claude 模型（当前是 DeepSeek 兼容端点）；不要写死模型名。
- `ANTHROPIC_AUTH_TOKEN` 用 Bearer，`ANTHROPIC_API_KEY` 用 x-api-key，不要同时传。
- 官方 Anthropic 与 DeepSeek 兼容端点的行为不同，只有官方走 fallback beta。
- 本机 Claude Code 配置（DeepSeek Anthropic 兼容端点）已通过真实调用验证单篇/新闻概览；Anthropic 官方付费 Key 仍未验证。
- 新闻概览输出必须严格 JSON；已加一次解析失败重试。不要在校验失败时无限自动重试。
- 新闻概览缓存键需包含当天新闻指纹与 AI 服务商/模型，避免换模型后继续展示旧结果。
- AI 摘要与正文缓存独立；正文没了，AI 卡片仍要显示，但「重新精读」需要正文。
- AI 请求目前走全局代理，不受按来源直连影响。

## 未决问题

- 是否增加「AI 请求直连」开关。
- 是否让用户选择 AI 模型/温度/输出语言。
- 是否对长文分段总结以控制 token。

# CLAUDE.md

## 项目记忆（AI）

开始非简单任务前，先读 `docs/ai-memory/MEMORY.md`，再按其中顺序读取 `PROJECT.md`、`STATE.md` 和相关 topics/history。
记忆与代码冲突时以代码为准，并顺手修正记忆。

## 快速命令

- `npm start` — 启动应用
- `npm run dev` — 启动并打开 DevTools
- `npm run icon` — 重新生成应用图标
- `npm run cursor` — 重新生成画笔光标

## 关键约定

- 所有网络请求在主进程完成；渲染层 CSP 禁止网络。
- 远端文本必须转义后渲染；颜色只来自 design tokens。
- API Key 只能在主进程使用；本机 Claude Code token 不复制、不传渲染层。
- 阅读器文章正文用 `#reader-content` 局部刷新，避免整块重建导致闪烁。
- 记忆与代码冲突以代码为准，并更新 `docs/ai-memory/`。

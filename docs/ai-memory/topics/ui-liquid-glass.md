---
name: ui-liquid-glass
description: 液态玻璃视觉系统、主题、无边框窗口、侧栏与首页层级
type: topic
updated: 2026-11-23
related: [[reader-experience]]
---

# 液态玻璃 UI

## 当前实现

- 直接使用 Liquid Glass tokens + `lg-` 组件；应用层样式在 `app.css`。
- 玻璃表面五件套：半透明底色 + 顶部径向高光 + 1px 亮边 + inset 高光 + `backdrop-filter`。
- 玻璃只用于浮动层：工具栏、侧栏、阅读面板、弹窗、主题/画笔弹层；正文卡片用 `--bg-surface`。
- 6 套主题：aurora / ocean / forest / ember / violet / light；在 `<html data-theme>` 切换，`theme-boot.js` 防止首屏闪烁。
- 无边框窗口 + 自定义标题栏；窗口按钮、拖动区、双击最大化由 Electron 处理。
- 首页层级：概览是默认主入口；Claude 专区是普通导航项，不再使用侧栏大 Featured 卡。
- 首页今日简报从全来源中挑最新实质内容，过滤 HN「Is Hiring」类招聘帖。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency`、无 `backdrop-filter` 回退。

## 关键文件

- `src/styles/tokens.css` — 颜色/主题/玻璃物理/几何/动效 tokens
- `src/styles/liquid-glass.css` — 玻璃组件（`lg-` 前缀）
- `src/styles/app.css` — 应用布局、阅读器、设置、画笔、PDF 无关 UI
- `src/index.html` — 应用壳与无边框标题栏
- `src/js/theme-boot.js` — 主题防闪烁
- `src/js/views.js` — 侧栏/首页/阅读器渲染
- `scripts/make-icon.js` / `build/icon.*` — 应用图标

## 约束与坑

- 不要在组件里硬编码颜色；新增颜色先加 token 并在 6 套主题补齐。
- 一屏一个主色行动点；危险操作用 danger token。
- 正文卡片不要加 `backdrop-filter`，否则性能和可读性都会变差。
- 浅色主题的 `--text-muted` 是 `#6b7280`（原 token 太浅），这是为可读性做过的手动调整。
- 主题预览色块是元数据，允许保留字面颜色；其它 UI 颜色必须来自 token。

## 未决问题

- 是否需要原生全屏（隐藏标题栏）作为第二种全屏模式。
- 首页是否进一步减少 Claude 相关区块，或允许用户自定义首页模块。

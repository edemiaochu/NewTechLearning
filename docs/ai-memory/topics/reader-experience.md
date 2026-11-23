---
name: reader-experience
description: 阅读器三种布局、尺寸、字号、局部刷新与笔记稳定性
type: topic
updated: 2026-11-23
related: [[ui-liquid-glass]], [[ink-annotation]], [[caching-persistence]]
---

# 阅读体验

## 当前实现

- 三种布局，状态存 `state.ui.readerLayout` 并持久化：
  - `center` — 居中玻璃阅读窗口
  - `fullscreen` — 填满标题栏以下的内容区
  - `split` — 右侧独立分栏，左侧信息流保持可点击
- 分栏是布局的一部分，不是 modal；点击另一篇文章只替换右栏内容。
- 居中阅读框：默认宽 800、可用高度；右下角手柄拖宽高，双击重置。
- 全屏阅读正文：默认宽 760，右侧竖条拖宽度；正文列由 `--reader-column-width` 控制。
- 字号 14–24px（默认 17），宽度 520–1100px（默认 760）；`Aa` 弹层与设置同步。
- 阅读器拆成稳定外壳 + `#reader-content`；文章加载、AI 更新只替换内容区，不重建头部/笔记/滚动容器，避免闪烁和焦点丢失。
- 笔记 textarea 立即写 state，localStorage 持久化；内容刷新不丢输入。
- 阅读器头部提供：Aa、画笔、布局、收藏、导出 PDF（居中/全屏）、外部链接（非分栏）、关闭。
- 分栏模式隐藏头部的外部链接，避免 400px 宽度下拥挤；底部仍保留原文入口。

## 关键文件

- `src/js/views.js` — `renderReaderPanel`、`renderReaderContent`、布局按钮
- `src/js/app.js` — `renderOverlayUI`、`refreshReaderContent`、`renderSplitReader`、尺寸拖拽
- `src/styles/app.css` — `reader-overlay`、`reader-panel`、content stack、grips

## 约束与坑

- 阅读器整块重渲染会导致入场动画重复、毛玻璃重绘、笔记输入框重建；必需时加 `no-anim`。
- 分栏模式下 `renderSplitReader` 按 `activeItem.id + layout` 签名去重，视图切换时保留阅读器滚动。
- 居中阅读框与分栏宽度是两套独立尺寸；不要混用。
- 正文列宽度受面板宽度限制；全屏拖拽只改正文列，不改面板。
- 笔记自动保存；关闭/切换文章前不要把 textarea 的 DOM 当作唯一数据源。

## 未决问题

- 原生全屏（隐藏标题栏）是否值得加。
- 笔记区是否移到文章顶部或做成侧边抽屉。
- 阅读进度是否持久化并显示。

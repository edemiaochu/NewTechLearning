---
name: ink-annotation
description: 阅读器画笔：SVG 笔迹层、工具、光标、按文章持久化
type: topic
updated: 2026-11-23
related: [[reader-experience]], [[caching-persistence]], [[ui-liquid-glass]]
---

# 画笔标注

## 当前实现

- 阅读器右上角画笔按钮 + 快捷键 `P`；`Esc` 先退出画笔。
- 悬浮工具栏（玻璃 pill）：
  - 4 色：紫 / 青 / 红 / 高对比（用 token 的 CSS 类）
  - 3 档粗细：2 / 4 / 7
  - 橡皮擦：点击笔迹附近删除最近一笔
  - 撤销 `Ctrl/Cmd+Z`
  - 清空当前文章（confirm）
  - 退出画笔
- 绘制层：`.reader-content-stack` 内绝对定位 SVG，`viewBox="0 0 1000 1000" preserveAspectRatio="none"`；笔迹点归一化 0–1000，`vector-effect="non-scaling-stroke"` 保持线宽。
- 笔迹保存：localStorage `fr.ink`，按文章 ID：
  - 每篇最多 160 笔、每笔最多 500 点
  - 最多保留 40 篇文章，按更新时间淘汰
- 重新打开文章、重启应用后恢复；画笔关闭时笔迹仍可见。
- 自定义光标：`src/assets/pen-cursor.png`，热点 3,30；橡皮擦模式 `cursor: cell`。
- 绘制时 SVG 覆盖正文内容区并接收 pointer events；笔记/页脚不在覆盖范围。
- 切换文章/关闭阅读器自动退出画笔；布局切换保留画笔状态并重绘笔迹层。

## 关键文件

- `src/js/app.js` — `setPenActive`、`bindPen`、`eraseInkAt`、`undoInk`、`clearInk`
- `src/js/views.js` — `renderInkStrokes`、`renderPenToolbar`、content stack
- `src/js/state.js` — `persistInk`、`fr.ink` 初始化/裁剪
- `src/styles/app.css` — `.reader-ink`、`.ink-*`、画笔工具栏、光标
- `scripts/make-cursors.js` / `src/assets/pen-cursor.png` — 铅笔光标

## 约束与坑

- 笔迹坐标是相对内容区归一化；字号/宽度/内容高度变化时笔迹会随之拉伸，不保证与文字精确对齐。
- 画笔开启时 SVG 抢占正文交互（AI 按钮、文本选择不可用），需先退出画笔。
- 笔迹只存在应用内，不进入 PDF。
- 撤销只弹最后一笔，没有多级历史；重开文章后 undo 栈等于持久化笔迹。
- 橡皮擦是点击命中，不是连续擦除。
- 画笔状态不跨文章保留（工具颜色/粗细保留，开关不保留）。
- 光标资源是 32×32 PNG；若加载失败回退 crosshair。

## 未决问题

- 画笔与 PDF 导出结合（按当前阅读布局叠加）。
- 连续拖拽橡皮擦、多级 undo/redo。
- 笔迹与文字锚点绑定，避免重排导致错位。

---
name: export-pdf
description: 文章与学习笔记 PDF 导出：隐藏窗口 printToPDF、白底 A4 模板
type: topic
updated: 2026-11-23
related: [[reader-experience]], [[ink-annotation]]
---

# PDF 导出

## 当前实现

- 文章 PDF：
  - 入口：阅读器头部下载图标（居中/全屏）、底部「导出 PDF」（所有布局）
  - 内容：标题、来源、作者、时间、原文链接、速读要点、关键词、AI 精读、完整正文、学习笔记、页脚
- 笔记 PDF：
  - 入口：学习笔记页「导出 PDF」
  - 内容：全部笔记，按标题/来源/链接/更新时间/正文
- 生成方式：`lib/pdf.js`
  - 构造白底 A4 HTML 模板（内嵌 CSS，无远程资源）
  - 隐藏 `BrowserWindow` 加载临时 HTML
  - 等 `document.fonts.ready`
  - `webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: ... })`
  - 写文件，销毁窗口，清理临时目录
- 排版：白底、深色正文、紫色强调、摘要/AI 卡片浅色背景、代码块、分页避免标题孤行。
- 保存对话框由主进程 `dialog.showSaveDialog` 处理；文件名按标题清理非法字符。
- 不新增依赖。

## 关键文件

- `lib/pdf.js` — HTML 模板、快照渲染、printToPDF、文件名清理
- `main.js` — `pdf:export-article`、`pdf:export-notes` IPC
- `preload.js` — `exportArticlePdf` / `exportNotesPdf`
- `src/js/views.js` — 导出按钮
- `src/js/app.js` — payload 组装、保存/失败提示

## 约束与坑

- 所有远端内容必须先转义；链接仅允许 http(s)。
- 隐藏窗口的 CSP 限制为本地样式，不加载远程图片/字体。
- 文章 blocks 和笔记文本由渲染层发送；主进程只做安全渲染。
- 画笔标注不进入 PDF；需要的是正文/摘要/笔记。
- 首次点击导出需要正文已加载；否则提示稍后再试。
- 当前页边距由 printToPDF 参数控制（单位英寸），CSS `@page` 不设 margin。
- 验证过快照：文章 3 页、笔记 1 页；中英文、链接、列表、代码块、分页正常。

## 未决问题

- 是否支持带画笔标注的 PDF。
- 是否支持深色主题 PDF 或自定义纸张。
- 是否批量导出收藏/整个专区。

---
name: ui-liquid-glass
description: 液态玻璃视觉系统、WebGL2 光学玻璃层、主题、无边框窗口、侧栏与首页层级
type: topic
updated: 2026-11-24
related: [[reader-experience]]
---

# 液态玻璃 UI

## 当前实现

- 直接使用 Liquid Glass tokens + `lg-` 组件；应用层样式在 `app.css`。
- 玻璃表面五件套：半透明底色 + 顶部径向高光 + 1px 亮边 + inset 高光 + `backdrop-filter`。
- 玻璃只用于浮动层：工具栏、侧栏、阅读面板、弹窗、主题/画笔弹层；正文卡片用 `--bg-surface`。
- 6 套主题：aurora / ocean / forest / ember / violet / light；在 `<html data-theme>` 切换，`theme-boot.js` 防止首屏闪烁。
- 无边框窗口 + 自定义标题栏。macOS 保留原生红绿灯（`trafficLightPosition` 垂直居中），隐藏自定义最小化/最大化/关闭按钮，品牌图标与「前沿雷达」移到右上；左侧预留 84px 给红绿灯。Windows/Linux 仍使用自定义窗口按钮，品牌在左。标题栏左侧的视图名（`.app-toolbar-title`）已隐藏，概览/今日热点等切换时不再显示左上角文字。
- 平台由 `preload.js` 暴露 `window.radar.platform`，`theme-boot.js` 在首屏前写入 `html[data-platform]`，避免布局闪烁；macOS 规则只作用于 `html[data-platform="darwin"]`。
- 首页层级：概览是默认主入口；Claude 专区是普通导航项，不再使用侧栏大 Featured 卡。
- 首页今日简报从全来源中挑最新实质内容，过滤 HN「Is Hiring」类招聘帖。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency`、无 `backdrop-filter` 回退。

## WebGL2 光学玻璃层（2026-11-24）

- 使用 `liquid-glass-optics` skill 的 vanilla 核心，复制到 `src/liquid-glass/`；无 bundler，`tsc` 编译后的 `.js` 一并入库。
- `#glass-canvas` 固定在 UI 之后；一个 `createLiquidGlass` 控制器渲染程序化环境 + Snell 折射/色散/Fresnel/指针高光。
- 注册表面（`src/js/glass.js`）：`#titlebar`、`#sidebar`、`.app-search`、`.app-tool-cluster`、`.lg-window-controls`。侧栏是**单个**光学表面，导航/来源行是普通 CSS 行，不再注册为独立玻璃形状。主内容区也不注册表面。
- 侧栏重设计（2026-11-24）：导航分为「浏览 / 我的」两组，来源分为「资讯源 / 新闻源」；分组标签 + 分隔线，行高统一（导航 36px、来源 31px），计数改为普通文本，active 用 accent tint + 左侧 2px 光条，底部同步信息改成一张小卡片。行级玻璃 rims 移除后，侧栏从 20 个描边胶囊变成一块干净的玻璃面板。
- 2026-11-24 同步 skill 更新：`PRESETS.Liquid` 改为 `thickness 84 / bevel 4`，接触阴影默认关闭（`shadowStrength = 0.0`），边缘吸收恢复为 `0.90 → 1.0`。窄 bevel + 无阴影让玻璃边变成细亮 rim，不再出现暗色描边。
- 2026-11-24 清晰度对齐 PDF-Reader：主内容 `.lg-main` 改为不透明静态舞台（`--bg-viewer` + 主题 ambient 渐变），光学材质只用于标题栏/侧栏/浮动控件；浮动控件用宿主 `--shadow-optical` 补深度（shader 已无接触阴影）；移除 `.lg-root` 的 `-webkit-font-smoothing: antialiased`。正文不再压在全屏动画折射背景与 5% 透明卡片上。
- 由于主内容舞台不透明，`.head-actions` 的次级按钮不再注册为光学表面，恢复 CSS 按钮；主内容中不允许出现 WebGL 玻璃表面（会被不透明舞台盖住）。
- 表面倍率跟随更新后的 tuning：大面板（标题栏/侧栏）`1.1 / 1.05`，搜索框/工具栏簇/按钮胶囊 `0.55 / 0.7`，窗口控制 `0.5 / 0.55`。
- 环境调色板由当前主题 tokens 实时生成（`--bg-app`、`--accent-*`、`--ambient-blue`），六套主题各自保留色调；主题切换通过 `MutationObserver` 监听 `data-theme`。
- 核心相对 skill 的本地扩展：`GlassPalette` / `setPalette()`、`clip`、`MAX_SHAPES=40`；玻璃 shader 的阴影/边缘/rim 参数与更新后的 skill 保持一致。重新编译见 `src/liquid-glass/README.md`。
- 背景模式可在「设置 → 外观 → 光学玻璃背景」切换：`clean` 柔光渐变（默认）、`specimen` 光学标定（同心环/点阵/制图线）、`solid` 主题纯色。持久化键 `fr.glassBackground`；主题切换时 solid 颜色与 clean/specimen 调色板同步更新。
- `specimen` 的环/点/制图线使用 palette 的 `uInk` 与 accent 色，不再写死紫/橙；`solid` 模式下玻璃仍有 tint、边缘高光、Fresnel 与指针高光，但没有背景折射。
- `html.lg-webgl-ready` 下才把 `.lg-root/.lg-app/.lg-main` 设为透明并隐藏 `.lg-ambient/.app-grid`；WebGL2 不可用或 `prefers-reduced-transparency` 时保持原 CSS 玻璃。
- 覆盖层（modal / popover / toast / reader）仍是 CSS 玻璃：页面 canvas 位于 DOM 之后，不能绘制在覆盖内容之上。
- 正面卡片、正文、阅读器不做 WebGL 折射，保证可读性；玻璃只用于 chrome 与浮动控件。
- 注册表面必须一路透明到 canvas；否则祖先背景会把 shader 玻璃盖住。`glass-webgl.css` 负责去掉这些表面的 CSS 背景/backdrop/border/shadow。
- 重构核心时按 `src/liquid-glass/README.md` 重新编译 TS 并补 `.js` 扩展名。

## 关键文件

- `src/styles/tokens.css` — 颜色/主题/玻璃物理/几何/动效 tokens（含 `--glass-optics-tint`）
- `src/styles/liquid-glass.css` — 玻璃组件（`lg-` 前缀）
- `src/styles/glass-webgl.css` — WebGL 启用时的透明化/覆盖规则（`html.lg-webgl-ready`）
- `src/styles/app.css` — 应用布局、阅读器、设置、画笔、PDF 无关 UI
- `src/index.html` — 应用壳、`#glass-canvas`、样式顺序（core.css 在组件表之前）
- `src/js/glass.js` — 初始化、静态 chrome 表面注册、主题调色板、背景模式
- `src/js/state.js` — `state.glassBackground` + `fr.glassBackground` 持久化
- `src/js/views.js` — 设置「外观」中的背景模式分段控件
- `src/liquid-glass/` — 光学核心（`.ts` 源 + 编译 `.js` + `core.css` + README）
- `src/js/theme-boot.js` — 主题/平台防闪烁（`data-theme`、`data-platform`）
- `preload.js` / `main.js` — `radar.platform`；macOS `trafficLightPosition`
- `src/js/views.js` — 侧栏/首页/阅读器渲染
- `scripts/make-icon.js` / `build/icon.*` — 应用图标

## 约束与坑

- 不要在组件里硬编码颜色；新增颜色先加 token 并在 6 套主题补齐。WebGL 调色板从 tokens 派生。
- 一屏一个主色行动点；危险操作用 danger token。
- 正文卡片不要加 `backdrop-filter`，否则性能和可读性都会变差。
- 浅色主题的 `--text-muted` 是 `#6b7280`（原 token 太浅），这是为可读性做过的手动调整。
- 主题预览色块是元数据，允许保留字面颜色；其它 UI 颜色必须来自 token。
- 不要给 `.lg-surface` 加背景或 `backdrop-filter`：材质由 shader 负责；只有 `.lg-no-webgl` 回退例外。
- 一个页面只能有一个 `#glass-canvas` / `createLiquidGlass` 控制器；`MAX_SHAPES` 已提高到 40（renderer 与 shader 同步修改），当前典型用量 5 个 chrome 表面。
- 若以后重新加入滚动容器内的玻璃行，必须设置 `clip`，否则 shader 不受 DOM overflow 裁剪，会画到容器外；当前侧栏行不是玻璃，所以未使用。
- 覆盖层不要注册为 WebGL 表面；它们会被覆盖层的暗色遮罩盖住。
- 指针在 canvas 上不能拦截事件；canvas 必须是 `pointer-events: none`。

## 未决问题

- 是否需要原生全屏（隐藏标题栏）作为第二种全屏模式。
- 首页是否进一步减少 Claude 相关区块，或允许用户自定义首页模块。
- 若低端 GPU 掉帧，可降低 `renderer.ts` 的像素上限或增加“关闭光学玻璃”设置。

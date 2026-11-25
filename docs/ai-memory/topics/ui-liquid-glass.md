---
name: ui-liquid-glass
description: 液态玻璃工作台视觉系统、WebGL2 光学玻璃层、8 套主题、玻璃强度/灰度、18 项材质面板、光学开关与背景模式、无边框窗口与侧栏
type: topic
updated: 2026-11-25
related: [[reader-experience]]
---

# 液态玻璃 UI

## 当前实现

- 直接使用 Liquid Glass tokens + `lg-` 组件；应用层样式在 `app.css`。
- 玻璃表面五件套：半透明底色 + 顶部径向高光 + 1px 亮边 + inset 高光 + `backdrop-filter`。
- 玻璃只用于浮动层：工具栏、侧栏、阅读面板、弹窗、主题/画笔弹层；正文卡片用 `--bg-surface`。
- 8 套主题：aurora / ocean / forest / ember / violet / black / graphite / light；在 `<html data-theme>` 切换，`theme-boot.js` 防止首屏闪烁。black / graphite 由 `--theme-gray`（0–20）派生全部表面，可在主题面板实时调节灰度。
- 无边框窗口 + 自定义标题栏。macOS 保留原生红绿灯（`trafficLightPosition` 垂直居中），隐藏自定义最小化/最大化/关闭按钮，品牌组移到右上且**文字在左、logo 在右**（`lg-brand-name` order 1 / `lg-brand-icon` order 2）；左侧预留 84px 给红绿灯。Windows/Linux 仍使用自定义窗口按钮，品牌在左（图标在左、名称在右）。标题栏左侧的视图名（`.app-toolbar-title`）已隐藏，概览/今日热点等切换时不再显示左上角文字。
- 平台由 `preload.js` 暴露 `window.radar.platform`，`theme-boot.js` 在首屏前写入 `html[data-platform]`，避免布局闪烁；macOS 规则只作用于 `html[data-platform="darwin"]`。
- 首页层级：概览是默认主入口；Claude 专区是普通导航项，不再使用侧栏大 Featured 卡。
- 首页今日简报从全来源中挑最新实质内容，过滤 HN「Is Hiring」类招聘帖。
- 支持 `prefers-reduced-motion`、`prefers-reduced-transparency`、无 `backdrop-filter` 回退。

## WebGL2 光学玻璃层（2026-11-24）

- 使用 `liquid-glass-optics` skill 的 vanilla 核心，复制到 `src/liquid-glass/`；无 bundler，`tsc` 编译后的 `.js` 一并入库。
- `#glass-canvas` 固定在 UI 之后；一个 `createLiquidGlass` 控制器渲染程序化环境 + Snell 折射/色散/Fresnel/指针高光。
- 注册表面（`src/js/glass.js`）：`#titlebar`、`#sidebar`、`.app-search`、`.app-tool-cluster`、`.app-nav-cluster`。侧栏是**单个**光学表面，导航/来源行是普通 CSS 行，不再注册为独立玻璃形状。窗口控制是三个无边框图标按钮，不注册玻璃表面，也没有外框或阴影。主内容区也不注册表面。
- 侧栏重设计（2026-11-24）：导航分为「浏览 / 我的」两组，来源分为「资讯源 / 新闻源」；分组标签 + 分隔线，行高统一（导航 36px、来源 31px），计数改为普通文本，active 用 accent tint + 左侧 2px 光条，底部同步信息改成一张小卡片。行级玻璃 rims 移除后，侧栏从 20 个描边胶囊变成一块干净的玻璃面板。
- 2026-11-24 清晰度对齐 PDF-Reader：主内容 `.lg-main` 改为不透明静态舞台（`--bg-viewer` + 主题 ambient 渐变），光学材质只用于标题栏/侧栏/浮动控件；浮动控件用宿主 `--shadow-optical` 补深度；移除 `.lg-root` 的 `-webkit-font-smoothing: antialiased`。正文不再压在全屏动画折射背景与 5% 透明卡片上。
- 由于主内容舞台不透明，`.head-actions` 的次级按钮不再注册为光学表面，恢复 CSS 按钮；主内容中不允许出现 WebGL 玻璃表面（会被不透明舞台盖住）。
- 2026-11-25 同步 `liquid-glass-optics` 最新核心：新增 13 个 `GlassStyle` 字段（接触阴影 5、边缘高光 5、高光/反射 3），与 5 个材质字段合计 18 项；材质面板升级为 568px、两列 2×2 卡片、18 个实时滑块，分组为材质 / 接触阴影 / 边缘高光 / 高光与反射。
- 上游移除了宿主调色板（`GlassPalette` / `setPalette()`）：程序化环境改为核心内置的 `dark` / `light` 两套主题，只有 `light` 主题映射到浅色环境；八套 CSS 主题仍各自控制表面与内容颜色。保留的唯一本地核心扩展是 `registry` 的 `clip`；`MAX_SHAPES` 回到上游 32。
- 表面倍率跟随上游表：工具栏胶囊 `layer 2`、`tint .16`、`bevel .55 / thickness .7 / refraction 1.15`；标题栏与侧栏 `layer 1`、`tint .16`、`bevel .25 / thickness .45 / refraction 1`。光学胶囊内按钮 hover 只改图标颜色，不再叠加 CSS 底色/边框/上浮/阴影（`glass-webgl.css`）。
- 背景模式在主题面板与「设置 → 外观」共用：`clean` 柔光渐变、`specimen` 光学标定、`solid` 主题纯色、`image` 内置 Optical Chart（light/dark 自动匹配）。持久化键 `fr.glassBackground`；主题切换时 solid 颜色与 image 的明暗变体同步更新。
- 内置图片以 data URL 形式由 `scripts/build-glass-backgrounds.js`（`npm run glass-bg`）生成到 `src/js/glass-backgrounds.js`：Electron 的 `file://` 页面里 WebGL 拒绝跨源 `<img>` 纹理，data URL 同时满足 CSP `img-src data:`。
- 背景漂移是显式开关（`fr.glassAnimation`，默认关闭），对应上游 `backgroundAnimation`；`prefers-reduced-motion` 下仍冻结。
- 光学开关（`fr.opticalGlass`，默认开启）：关闭时销毁 renderer、移除 `lg-webgl-ready`、隐藏 canvas 并加 `lg-optical-off`，立即回到 CSS 玻璃；重新开启会用当前主题、背景与参数重建并重新注册 5 个表面。
- `html.lg-webgl-ready` 下才把 `.lg-root/.lg-app/.lg-main` 设为透明并隐藏 `.lg-ambient/.app-grid`；WebGL2 不可用或 `prefers-reduced-transparency` 时保持原 CSS 玻璃。
- 覆盖层（modal / popover / toast / reader）仍是 CSS 玻璃：页面 canvas 位于 DOM 之后，不能绘制在覆盖内容之上。
- 正面卡片、正文、阅读器不做 WebGL 折射，保证可读性；玻璃只用于 chrome 与浮动控件。
- 注册表面必须一路透明到 canvas；否则祖先背景会把 shader 玻璃盖住。`glass-webgl.css` 负责去掉这些表面的 CSS 背景/backdrop/border/shadow。
- 重构核心时按 `src/liquid-glass/README.md` 重新编译 TS 并补 `.js` 扩展名；上游 `registry.ts` 覆盖回来前要重新加上 `clip`。

## 工作台壳层（2026-11-25）

- 采用 `glass-workspace-ui` 的工作台规范：工具栏仍是单行 58px，但拆成两组玻璃胶囊——导航组（侧栏开关 | 概览 / 今日热点 / 全部资讯）与操作组（刷新 | 主题 / 设置），右侧搜索框与窗口控制固定；组内按钮 32×32、图标 18×18、stroke 2、组内 gap 2px、组间 10px。
- 侧栏可折叠（工具栏开关或 `Ctrl/⌘ + B`）并可拖动调整宽度（200–380px，双击恢复 262px）；持久化键 `fr.sidebarCollapsed` / `fr.sidebarWidth`。折叠时侧栏与 resizer 一起隐藏，主区自动铺满。
- 主题面板改为 348px、4 列 × 58px 卡片（8 套主题），下方提供玻璃强度（0–100%）、灰度（仅 black/graphite 可用）、光学开关、光学背景（柔光/标定/纯色/内置图片）、背景漂移与「材质与光效参数」入口。主题切换后面板保持打开，便于继续调参。
- 设置「外观」与主题面板完全对应：同样有 8 主题网格、玻璃强度、灰度、光学开关、4 种背景、背景漂移、18 项材质面板入口，以及阅读字号/宽度；两处共用同一份 state 与持久化键。
- 玻璃强度 `--glass-alpha` 只缩放工具栏、胶囊（含 hover）、面板、侧栏、模态等浮层背景；tokens 中主题块改存 `--bg-*-base`，公开 `--bg-toolbar/cluster/cluster-hover/panel/sidebar/modal` 在文件末尾用 `color-mix()` 按 `--glass-alpha` 派生；无 `color-mix` 时回退到 base。WebGL shader 材质不随该滑块变化（与 skill 一致）。
- 材质面板（568px，优先放主题面板右侧/左侧，都放不下时下移并内部滚动）提供 18 个实时参数，持久化键 `fr.glassParams`；参数经 `glass.js#setGlassParams()` 直接写入 renderer。默认值为 Liquid 预设 + `DEFAULT_GLASS_STYLE`（阴影为 0）。
- 新增持久化键：`fr.glassAlpha`、`fr.themeGray`（`{ black, graphite }`）、`fr.glassParams`、`fr.glassBackground`、`fr.glassAnimation`、`fr.opticalGlass`、`fr.sidebarWidth`、`fr.sidebarCollapsed`。
- 主题面板与材质面板都是 CSS 玻璃覆盖层，不注册 WebGL 表面；`glass-params-panel` 与 `theme-popover` 共用 `.lg-popover` 表面。`glass-params-panel` 必须保留 `left:auto`，否则 `.lg-popover` 的 `left:0` 会覆盖内联 `right`，面板会贴到窗口左边。

## 关键文件

- `src/styles/tokens.css` — 颜色/主题/玻璃物理/几何/动效 tokens（含 `--glass-optics-tint`）
- `src/styles/liquid-glass.css` — 玻璃组件（`lg-` 前缀）
- `src/styles/glass-webgl.css` — WebGL 启用时的透明化/覆盖规则（`html.lg-webgl-ready`）
- `src/styles/app.css` — 应用布局、阅读器、设置、画笔、PDF 无关 UI
- `src/index.html` — 应用壳、`#glass-canvas`、样式顺序（core.css 在组件表之前）
- `src/js/glass.js` — 初始化/销毁、静态 chrome 表面注册、18 项参数、背景模式与漂移、光学开关
- `src/js/glass-backgrounds.js` — 由 `scripts/build-glass-backgrounds.js` 生成的内置背景 data URL
- `src/js/state.js` — `fr.glassBackground` / `fr.glassAnimation` / `fr.opticalGlass` / `fr.glassParams` 持久化
- `src/js/views.js` — 主题面板、18 项材质面板、设置「外观」
- `src/liquid-glass/` — 光学核心（`.ts` 源 + 编译 `.js` + `core.css` + `backgrounds/` + README）
- `src/js/theme-boot.js` — 主题/平台防闪烁（`data-theme`、`data-platform`）
- `preload.js` / `main.js` — `radar.platform`；macOS `trafficLightPosition`
- `src/js/views.js` — 侧栏/首页/阅读器渲染
- `scripts/make-icon.js` / `build/icon.*` — 应用图标

## 约束与坑

- 不要在组件里硬编码颜色；新增颜色先加 token 并在 8 套主题补齐。WebGL 环境色由光学核心的 dark/light 模型决定，不再从 tokens 派生。
- 一屏一个主色行动点；危险操作用 danger token。
- 正文卡片不要加 `backdrop-filter`，否则性能和可读性都会变差。
- 浅色主题的 `--text-muted` 是 `#6b7280`（原 token 太浅），这是为可读性做过的手动调整。
- 主题预览色块是元数据，允许保留字面颜色；其它 UI 颜色必须来自 token。
- 不要给 `.lg-surface` 加背景或 `backdrop-filter`：材质由 shader 负责；只有 `.lg-no-webgl` 回退例外。
- 一个页面只能有一个 `#glass-canvas` / `createLiquidGlass` 控制器；`MAX_SHAPES` 为上游 32，当前典型用量 5 个 chrome 表面。关闭再开启光学会销毁并重建控制器，表面会自动重新注册。
- 若以后重新加入滚动容器内的玻璃行，必须设置 `clip`，否则 shader 不受 DOM overflow 裁剪，会画到容器外；当前侧栏行不是玻璃，所以未使用。
- 覆盖层不要注册为 WebGL 表面；它们会被覆盖层的暗色遮罩盖住。
- 指针在 canvas 上不能拦截事件；canvas 必须是 `pointer-events: none`。

## 未决问题

- 是否需要原生全屏（隐藏标题栏）作为第二种全屏模式。
- 首页是否进一步减少 Claude 相关区块，或允许用户自定义首页模块。
- 低端 GPU 掉帧时优先引导用户关闭光学玻璃（已有运行时开关），仍可继续降低 `renderer.ts` 的像素上限。

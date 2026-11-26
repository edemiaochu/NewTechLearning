---
name: current-state
description: 项目当前状态：核心能力、今日热点、AI 概览/全屏/导出已完成；外观/材质已对齐更新后的 skill；未打包；待真实代理与导出保存对话框复测
type: state
updated: 2026-11-26
---

# 当前状态

## 已完成

- 15 个信息源抓取与本地资讯缓存：8 个技术来源 + 7 个新闻源 — `feeds.js` / `sources.js`
- 今日热点新闻模块：本地当天范围（<6 条回退近 24 小时）、跨来源事件聚合、多源热点、今日关键词、世界要闻 / 科技新闻分流、新闻源筛选 — `news.js` / `views.js`
- AI 今日概览：自动整理今日头条/概览/3–6 条重点/主题/接下来留意，置顶展示；按新闻指纹 + AI 服务商缓存，解析失败自动重试；可在设置关闭 — `ai.js` / `app.js` / `views.js`
- AI 今日概览全屏阅读：复用全屏阅读外壳，Esc/背景/关闭按钮退出，重点条目可跳文章 — `views.js` / `app.js` / `app.css`
- AI 今日概览导出：Markdown 与白底 A4 PDF，重点条目关联原报道链接 — `pdf.js` / `main.js` / `app.js`
- 设置新增 `autoNewsDigest`（默认开启）；概览缓存 `fr.newsDigest`
- claude.dev 官方 Markdown、arXiv 摘要、通用 HTML 正文抽取 — `article.js`
- Claude 专区、学习路线、专区笔记 — `views.js`
- 液态玻璃工作台 UI、8 套主题、无边框窗口、自定义图标 — `src/styles/` / `build/`
- 工作台壳层：单行分组玻璃工具栏（导航组/操作组）、可折叠与可拖动侧栏（`Ctrl/⌘+B`）、工具栏视图切换 — `index.html` / `app.js` / `app.css`
- 主题面板升级：348px 4 列 8 主题、玻璃强度 0–100%、纯黑/黑灰灰度调节、光学开关、光学背景（柔光/标定/纯色/内置图片）、背景漂移、18 项材质与光效参数面板 — `views.js` / `app.js` / `tokens.css` / `glass.js`
- 设置「外观」与主题面板完全对齐：8 主题、玻璃强度、灰度、光学开关、4 种背景、背景漂移、材质面板入口、阅读字号/宽度，共用同一份 state 与持久化键
- 同步 `liquid-glass-optics` 最新核心：18 项 `GlassParams`、`image` 背景与 `backgroundAnimation`、上游 dark/light 光学环境；保留本地 `clip` 扩展；光学胶囊内按钮 hover 不再叠加 CSS 第二层；macOS 品牌组改为文字在左、logo 在右 — `src/liquid-glass/` / `src/js/glass.js` / `glass-webgl.css` / `app.css`
- 内置 Optical Chart 背景以 data URL 打包（`npm run glass-bg`），避开 Electron `file://` 下 WebGL 跨源纹理限制
- 英文词典：阅读器双击英文单词查词，Cambridge 英英 + 英汉释义/例句/音标，Wiktionary 英英回退；内置 ECDICT 离线英汉（59k 词 + 39k 词形，约 2.2MiB，MIT），断网或 Cambridge 缺词时兜底并支持「联网重查」；主进程抓取解析，30 天本地缓存，可在设置关闭或清缓存 — `lib/dictionary.js` / `data/ecdict.json.gz` / `app.js` / `views.js`
- macOS 窗口适配：保留原生红绿灯并垂直居中，隐藏自定义窗口按钮，品牌图标与文字移到右上；Windows/Linux 保持原布局 — `main.js` / `preload.js` / `theme-boot.js` / `app.css`
- WebGL2 光学玻璃层：侧栏/搜索/工具栏簇真实折射、色散、Fresnel 与指针高光；标题栏本体不再有玻璃板（2026-11-26 移除注册，保持透明以透出 WebGL 环境；关闭光学时为应用底色平铺条）；侧栏是单个光学表面，导航/来源行为普通 CSS 行（2026-11-24 重设计）；窗口控制为无外框图标，不参与玻璃表面；主内容区是不透明静态舞台，保证正文清晰 — `src/js/glass.js` / `src/liquid-glass/` / `src/styles/glass-webgl.css`
- 光学玻璃背景模式：柔光渐变 / 光学标定 / 主题纯色 / 内置图片，设置→外观或主题面板切换并持久化 `fr.glassBackground`；另有背景漂移开关 `fr.glassAnimation` 与光学开关 `fr.opticalGlass`；主题切换同步暗/亮环境与纯色底
- 居中 / 全屏 / 右侧分栏阅读，分栏下信息流仍可点击
- 阅读框宽高、阅读栏宽度、字号 14–24px 可调并持久化
- 阅读器局部刷新，修复打开文章时闪烁
- 本地速读与多服务商 AI 精读 — `summarize.js` / `ai.js`
- 本机 Claude Code 配置跟随（DeepSeek Anthropic 兼容端点）
- 正文持久化缓存（60 篇）与 AI 摘要独立显示 — `article-store.js`
- 文章 PDF 与学习笔记 PDF 导出 — `pdf.js`
- 画笔标注：4 色、3 档粗细、橡皮擦、撤销、清空、铅笔/擦除光标
- 全局代理（系统/直连/手动）与按来源路由：直连优先，1.2 秒回退代理
- 独立直连 session、主机级探测缓存 5 分钟
- 首页层级调整：概览优先，Claude 专区降为普通导航

## 进行中 / 未完成

- 代码已提交 main：`7001e41` init → `b78d4d0` 增加新闻模块 → `41f1654` 更新 ui 为液态玻璃 → `a2f4ef3` 工作台界面与双击英文词典 → `e8b3299` 外观与设置对齐更新后的工作台规范
- 安装包尚未配置（无 electron-builder / Forge）

## 已知问题与限制

- 本机 Claude Code / DeepSeek 兼容端点已做真实 AI 调用验证；Anthropic 官方付费 Key 未验证
- AI 今日概览偶发返回不可解析 JSON；已自动重试一次，仍失败时保留旧缓存并提示手动重试
- 部分站点有付费墙/反爬；正文抽取失败时只显示来源摘要
- 首次打开文章需要网络；正文缓存需成功打开一次后才有
- 直连探测使用 HEAD，极少数只接受 GET 的站点可能被误判；可手动勾「直连」
- AI API 请求仍遵循全局代理，不受按来源直连影响
- 词典依赖 Cambridge 页面结构，站点改版或反爬会失败（此时英文回退 Wiktionary、英汉回退 ECDICT）；ECDICT 为常用词子集，生僻词/新词可能缺失；Oxford 无免费公开接口且 robots 禁止自动抓取，未接入
- 画笔标注仅在应用内显示，不进入 PDF
- 分栏宽度与居中阅读框尺寸不会在同一布局设置下互相换算
- WebGL 光学材质只用于透明 chrome 层；modal/popover/toast/阅读器仍是 CSS 玻璃 fallback（页面 canvas 无法绘制在覆盖内容之上）
- WebGL2 不可用或 `prefers-reduced-transparency` 时自动回到原 CSS 玻璃；光学层持续 RAF 渲染，低端集显未做帧率实测
- 主内容是不透明静态舞台，所以 `image` 背景只在工具栏/侧栏/搜索等 chrome 玻璃中可见；这是清晰度取舍，不是加载失败
- 上游光学环境只有 dark/light 两套，八套 CSS 主题不再各自生成折射环境色；主题差异仍体现在表面、强调色与内容

## 下一步

- [ ] 在真实 Clash / 系统代理环境复测 15 个来源与按来源路由延迟
- [ ] 决定是否增加「AI 请求直连」开关（复用 direct session）
- [ ] 配置 electron-builder，产出 Windows 安装包
- [x] 按功能拆分 git commit 并提交（`7001e41` / `b78d4d0` / `41f1654` / `a2f4ef3` / `e8b3299`）
- [ ] 增加自动化冒烟测试：Feed 解析、正文抽取、AI mock、PDF、路由选择
- [ ] 在真实窗口点击验证 AI 概览 Markdown/PDF 保存对话框（已验证按钮、IPC 与 PDF 渲染器）
- [ ] 视反馈考虑原生全屏、画笔与 PDF 结合、笔记区位置优化
- [ ] 在集显/低端设备实测 WebGL 光学玻璃帧率，必要时降低像素上限
- [x] 增加运行时「关闭光学玻璃」开关（主题面板/设置）与 4 种背景模式
- [ ] 在真实窗口验证 18 项材质滑块、光学开关与内置图片背景的手感

## 最近变化

- 2026-11-26 — 移除顶栏最外层玻璃：`#titlebar` 不再注册为 WebGL 表面，顶栏保持透明（只留分隔线）以透出环境，玻璃只留在搜索框与导航/操作图标胶囊；注意顶栏背景一旦不透明会盖住 canvas 上的光学材质（曾一度改成 `--bg-app` 导致看起来没有玻璃效果，已还原）；暗色与浅色主题截图验证通过
- 2026-11-25 — 外观与设置对齐更新后的 `glass-workspace-ui`：同步光学核心到 18 项 `GlassParams`，主题面板/设置新增光学开关、4 种背景（含内置 Optical Chart）、背景漂移，材质面板改为 568px 2×2 分组；macOS 品牌改为文字在左、logo 在右；详见 [topics/ui-liquid-glass.md](topics/ui-liquid-glass.md)
- 2026-11-25 — 新增英文词典：阅读器双击英文单词，Cambridge 英英 + 英汉释义与例句，Wiktionary 英英回退，主进程抓取与 30 天缓存；详见 [topics/dictionary.md](topics/dictionary.md)
- 2026-11-25 — 应用 `glass-workspace-ui` 工作台规范：工具栏拆为导航/操作两组玻璃胶囊（32px 按钮、18px stroke-2 图标），新增侧栏折叠与拖拽调宽，主题面板升级为 348px 8 主题 + 玻璃强度 + 灰度 + 光学背景 + 材质参数面板；详见 [history/2026-11-25.md](history/2026-11-25.md)
- 2026-11-24 — 侧栏重设计：浏览/我的/资讯源/新闻源分组，统一行高与计数样式，active 左侧光条，底部同步卡片；取消行级光学玻璃，侧栏保留单块玻璃
- 2026-11-24 — 对比 PDF-Reader 做清晰度对齐：主内容区改为不透明静态舞台，玻璃只保留在 chrome/侧栏；补宿主 `--shadow-optical`，移除抗锯齿字体设置
- 2026-11-24 — 同步 `liquid-glass-optics` 更新：Liquid 预设 84/4、关闭接触阴影、恢复 0.90 边缘吸收，玻璃边改为细亮 rim；移除本地 shadow/rim 扩展并按新 tuning 校准表面倍率
- 2026-11-24 — 使用 `liquid-glass-optics` skill 接入 WebGL2 光学玻璃层：标题栏/侧栏/搜索/工具栏/窗口控制真实折射与色散，主题调色板由 tokens 生成，保留 CSS fallback；详见 [history/2026-11-24.md](history/2026-11-24.md)
- 2026-11-24 — 新增「今日热点」新闻模块、7 个新闻源与 AI 今日概览；完成当天范围、事件聚合、关键词、世界/科技分流、来源筛选、自动 AI 整理、全屏阅读与 Markdown/PDF 导出；详见 [history/2026-11-24.md](history/2026-11-24.md)
- 2026-11-23 — 从 0 到 1 完成应用；完成阅读、缓存、代理、AI、PDF、画笔等迭代；详见 [history/2026-11-23.md](history/2026-11-23.md)

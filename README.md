# 前沿雷达 · Frontier Radar

一款**液态玻璃风格**的桌面应用，用来追踪、速读与总结前沿技术。它把 8 个前沿技术信息源与 7 个世界/科技新闻源汇成一条可搜索、可精读、可做笔记的信息流，并为 [claude.dev](https://claude.dev/) 单独保留了「Claude 专区」，另有「今日热点」新闻模块聚合当天世界大事与科技头条。

![Electron](https://img.shields.io/badge/Electron-45-47848F?logo=electron&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-%3E%3D20-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

## 功能

- **15 个信息源**：8 个前沿技术来源（claude.dev、OpenAI News、Google DeepMind、Google AI、arXiv cs.AI、Hacker News、MIT Technology Review、The Verge）+ 7 个新闻源（TechCrunch、Ars Technica、WIRED、IT之家、爱范儿、NPR World、France 24）。
- **今日热点新闻模块**：单独聚合当天世界大事与科技头条，按发布时间排列新闻流；标题相近的报道会自动聚成「热点事件」，按报道媒体数与社区热度排序，并提供今日关键词、世界要闻与科技新闻分流。
- **AI 今日概览**：打开「今日热点」后，AI 会自动把当天新闻整理成今日头条、整体概览、3–6 条重点信息、今日主题与「接下来留意」，置顶展示；结果按当天新闻指纹缓存，新闻变化后自动重新整理。可在「设置 → AI 精读」关闭自动整理或随时手动重新生成；支持全屏阅读，并支持一键导出 Markdown / PDF。
- **Claude 专区**：为 claude.dev 单独设计的专区，包含官方文章流、自动生成的学习路线、专区笔记，以及官方 Markdown 正文抓取。
- **液态玻璃工作台**：单行玻璃工具栏 + 分组图标胶囊、可折叠/可拖动侧栏、8 套主题（极光、深海、森林、熔岩、紫罗兰、纯黑、黑灰、明亮）、玻璃强度与灰度调节、光学开关、4 种光学背景、18 项材质与光效参数面板，自定义无边框窗口。
- **阅读面板**：站内正文提取、官方 Markdown 优先、外链安全打开、阅读时长、关键词、收藏与笔记。
- **三种阅读布局**：居中阅读、应用内全屏阅读、右侧分栏阅读。分栏模式与信息流并排，**列表保持可点击**，可以直接切换文章；拖动中间分隔条可调整栏宽，布局与宽度会被记住。
- **阅读排版可调**：正文支持 14–24px，阅读宽度支持 520–1100px，可在阅读器右上角「Aa」或「设置 → 外观」中调整；默认 17px / 760px，会记住你的选择。
- **阅读框可调整**：居中阅读时拖动右下角的手柄调整窗口宽高；全屏阅读时拖动正文右侧的竖条调整阅读宽度；分栏阅读时拖动中间分隔条调整栏宽；双击手柄恢复默认，尺寸会被记住。
- **英文词典**：阅读文章时双击英文单词，弹出 Cambridge 词典卡片，同时显示英英释义、英汉翻译、音标、词性与例句；英英在 Cambridge 不可用时回退 Wiktionary，英汉缺失或断网时使用内置的 ECDICT 离线词库（MIT，约 2.2MiB，59k 常用词 + 39k 词形），并显示柯林斯星级、牛津 3000 与考试标签。查询在主进程完成，按词缓存 30 天，可在「设置 → 阅读与词典」关闭或清除缓存。Oxford 没有免费公开接口且其 robots 规则不允许自动抓取，因此未接入。
- **画笔标注**：阅读器右上角的画笔可对正文做手写标注，鼠标会变成铅笔光标（橡皮擦模式为擦除光标），支持 4 种颜色、3 档粗细、橡皮擦、撤销与清空；标注按文章保存在本机，重新打开仍会显示。标注只存在于应用内，不会写入导出的 PDF。
- **本地速读**：完全离线的抽取式摘要（英文 + 中文），不需要 API Key。
- **AI 精读（可选）**：支持跟随本机 Claude Code 配置、Anthropic 官方、DeepSeek 原生、自定义 OpenAI 兼容接口（Ollama / LM Studio / 中转），生成中文一句话总结、关键要点、意义、术语卡与延伸问题。
- **学习闭环**：已读/未读、收藏夹、自动保存的学习笔记、一键导出 Markdown。
- **导出 PDF**：阅读器里可把当前文章导出为白底 PDF（包含速读要点、AI 精读、正文与学习笔记）；学习笔记页支持导出全部笔记 PDF；「今日热点」的 AI 概览支持导出 Markdown 与白底 PDF（含重点、主题、后续关注与原报道链接）。
- **信息流**：混合排序（每个来源轮流出现）或严格按时间排序，支持搜索、来源筛选、只看未读。
- **网络与代理**：默认跟随 Windows / macOS 系统代理（Clash、Surge、PAC 等），也可在设置中切换直连或手动 HTTP / SOCKS5 代理；每个来源默认「直连优先，约 1.2 秒无响应自动回退代理」，也可以勾选为强制直连。设置页提供 claude.dev 连通性测试。
- **本地优先**：抓取结果、打开过的文章正文、AI 精读摘要、已读/收藏与笔记都保存在本机；断网或代理异常时，阅读过的文章和 AI 摘要仍可重新打开。启动时与每 30 分钟自动同步。

## 信息源

### 前沿技术来源

| 来源 | 内容 | 抓取方式 |
| --- | --- | --- |
| claude.dev | Anthropic 开发者博客、构建日志、工程实践 | RSS + 官方 `.md` 正文 |
| OpenAI News | 模型发布、研究公告 | RSS |
| Google DeepMind | 前沿 AI 研究 | RSS |
| Google AI | AI 产品与研究生态 | RSS |
| arXiv cs.AI | 每日 AI 预印本（摘要） | RSS + 摘要页解析 |
| Hacker News | 工程师社区头条 | RSS |
| MIT Technology Review | 技术趋势与深度报道 | RSS |
| The Verge | 科技产业新闻 | RSS |

### 新闻热点来源（「今日热点」模块）

| 来源 | 内容 | 分组 |
| --- | --- | --- |
| TechCrunch | 创业、融资并购与科技产业 | 新闻热点 |
| Ars Technica | 技术、科学与政策深度报道 | 新闻热点 |
| WIRED | 科技文化与商业趋势 | 新闻热点 |
| IT之家 | 中文科技快讯与数码资讯 | 新闻热点 |
| 爱范儿 | 消费科技与数字生活 | 新闻热点 |
| NPR World | 国际新闻与全球热点 | 世界要闻 |
| France 24 | 全球突发新闻与国际局势 | 世界要闻 |

此外，Hacker News、MIT Technology Review 与 The Verge 也会参与「今日热点」的事件聚合，但它们仍列在「资讯源」中。

来源配置在 `lib/sources.js`，每个来源的保留条数在 `lib/feeds.js` 的 `MAX_ITEMS_BY_SOURCE` 中调整。`news: true` 的来源会进入「今日热点」聚合；`newsSection: true` 的来源在侧栏单独列在「新闻源」；`world: true` 的来源会额外进入「世界要闻」分区。

## 快速开始

要求 **Node.js 20+**（本项目在 Node 22 / Electron 45 上开发与验证）。

```bash
npm install
npm start
```

开发模式（自动打开 DevTools）：

```bash
npm run dev
```

> 首次启动会并行抓取全部 15 个信息源，通常需要十几秒。之后会使用本地缓存并在后台同步。
>
> 如果 Electron 二进制下载较慢，可使用镜像（Git Bash）：
>
> ```bash
> ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
> ```

## 网络与代理

所有网络请求（RSS 抓取、正文抓取、AI API）都在主进程通过 Electron 的 Chromium 网络栈发出，因此：

- **默认跟随系统代理**：Windows「设置 → 网络和 Internet → 代理」、macOS 系统代理、PAC 脚本均会生效。Clash / Surge 等工具开启「系统代理」后无需额外配置。
- **直连**：忽略系统代理。
- **手动代理**：在「设置 → 网络与代理」中填入 `http://127.0.0.1:7890`、`socks5://127.0.0.1:7890` 等地址。
- **按来源路由**：每个来源默认「自动」——先直连探测，约 1.2 秒内没有响应再走全局代理。勾选某个来源则强制直连，不再回退代理。该规则同时作用于来源列表和文章正文，列表抓取时按主机缓存探测结果 5 分钟，避免每篇文章都重新等待。
- 设置页提供「测试 claude.dev」按钮，会按 Claude 的实际路由（自动 / 强制直连）测试连通性。
- 代理只影响本应用，不会修改系统代理设置。AI API 请求仍遵循全局代理设置。

> 注意：旧版本使用 Node `fetch`，不会读取系统代理；当前版本已切换为 Chromium 网络栈。

## AI 精读

「AI 精读」有两处入口：阅读面板里的单篇精读，以及「今日热点」顶部的 AI 今日概览。后者会在打开新闻模块时自动整理当天最重要的信息，并把结果缓存在本机；「设置 → AI 精读 → 今日 AI 概览」可以关闭自动整理。两种能力共用同一套 AI 服务商配置：

阅读面板里的「AI 精读」支持四类服务，在「设置 → AI 精读」中切换：

| 模式 | 说明 | 凭据 |
| --- | --- | --- |
| 跟随本机 Claude Code | 读取 `~/.claude/settings.json` 的 `env`（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`） | 不复制到本应用 |
| Anthropic 官方 | 官方 Messages API，默认 `claude-opus-5-5` | 应用内加密保存 |
| DeepSeek 原生 | `https://api.deepseek.com/v1`，默认 `deepseek-chat` | 应用内加密保存 |
| 自定义 OpenAI 兼容 | Ollama、LM Studio、OpenAI、国内中转等 | 可留空 |

说明：

- **默认使用「跟随本机 Claude Code」**：应用每次请求时由主进程读取本机配置，所以能直接沿用 Claude Code 里已经配置好的 DeepSeek Anthropic 兼容端点与模型。凭据不会复制到本应用，也不会发送到渲染层。
- 其他模式的 Key 通过 Electron `safeStorage` 使用操作系统安全存储加密后保存在本机；如果系统不支持，则只在本次运行期间保留，不写入磁盘。
- Anthropic 官方模式会启用服务端拒答回退；DeepSeek / 自定义 OpenAI 兼容接口不会收到 Anthropic 专属的 beta 参数。
- 单篇 AI 精读只有在点击「AI 精读」时，当前文章的正文才会发送给所选服务商。API 费用由你的服务商账户承担。
- 「今日 AI 概览」开启自动整理后，打开「今日热点」会把当天候选新闻的标题、来源与摘要发送给所选 AI 服务；不会发送完整正文。可在设置中关闭，关闭后仍可手动生成一次。
- AI 今日概览可点「全屏阅读」进入沉浸式阅读，点击重点条目会关闭概览并打开对应文章。
- AI 今日概览可导出 Markdown 或 PDF；导出内容只包含概览结构、重点信息与原始报道链接，不包含完整正文。
- 不配置也可以使用完全离线的本地速读、笔记与收藏；新闻模块的本地事件聚合、关键词与新闻流不依赖 AI。

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl / Cmd + K` | 聚焦搜索 |
| `Ctrl / Cmd + B` | 显示 / 隐藏侧栏 |
| `R` | 刷新全部来源 |
| `P` | 打开 / 关闭阅读画笔（阅读器内） |
| `Ctrl / Cmd + Z` | 撤销上一笔（画笔开启时） |
| `Esc` | 退出画笔 / 关闭阅读面板 / 设置 / 主题弹层；清空搜索 |

## 数据与隐私

- 资讯缓存：`<userData>/feed-cache.json`
- 文章正文缓存：`<userData>/article-cache.json`（最多保留 60 篇，按打开时间淘汰）
- 词典缓存：`<userData>/dictionary-cache.json`（最多 600 词，30 天过期）
- 离线词典：`data/ecdict.json.gz`（ECDICT 精简子集，MIT；由 `scripts/build-ecdict.js` 生成）
- 设置与加密后的 Key：`<userData>/settings.json`
- 已读、收藏、笔记、画笔标注、AI 精读摘要、AI 今日概览、主题、词典开关：Chromium `localStorage`（同样位于 `<userData>`）
- Windows 下的 `<userData>` 通常为 `%APPDATA%\前沿雷达`。

安全设计：

- `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`
- 渲染进程 CSP 仅允许本地资源，禁止远程脚本与 `connect-src`
- 所有网络请求在主进程完成，且仅允许 `http(s)`；遵循系统代理或用户手动代理
- 外部链接通过系统浏览器打开，渲染进程不会导航到远程页面
- 远端文章内容一律经过转义后再渲染

## 项目结构

```text
main.js                 Electron 主进程：窗口、IPC、自动同步、导出
preload.js              contextBridge 暴露的最小 API
lib/
  sources.js            信息源注册表
  feeds.js              RSS / Atom 抓取、解析、缓存与合并
  article.js            正文抽取（通用 HTML + claude.dev Markdown + arXiv 摘要）
  summarize.js          本地抽取式摘要、关键词、阅读时长
  settings.js           safeStorage 加密的本地设置
  ai.js                 多服务商 AI 精读（Anthropic SDK / OpenAI 兼容）
  local-claude.js       读取本机 Claude Code 配置（凭据不出主进程）
  net.js                带超时的 fetch 与 URL 校验
src/
  index.html            应用外壳（含固定 #glass-canvas）
  styles/               Liquid Glass tokens / 组件 + 应用层 + WebGL 光学层样式
  liquid-glass/         liquid-glass-optics vanilla 核心（TS 源 + 编译 JS）
  js/                   ES Module 渲染层：状态、视图、事件、主题
    glass.js            WebGL2 光学玻璃初始化/销毁、表面注册、18 项参数与背景
    news.js             今日范围、跨来源事件聚合、关键词
scripts/make-icon.js    无依赖生成 build/icon.png 与 icon.ico
build/                  应用图标
```

## 设计与实现说明

界面基于 **Liquid Glass** 设计系统（`src/styles/tokens.css` + `liquid-glass.css`，`lg-` 前缀），应用层样式在 `src/styles/app.css`。

- 颜色只来自 design tokens；组件中没有一次性硬编码颜色（主题预览色块除外）。
- 玻璃只用于浮动操作层：工具栏、侧栏、阅读面板、弹窗、主题弹层。正文卡片使用实色表面 + 细边框。
- 每屏只有一个主色行动点；危险操作用 danger token。
- 已实现 `prefers-reduced-motion`、`prefers-reduced-transparency` 与无 `backdrop-filter` 的回退。
- 内置 8 套主题（含纯黑/黑灰灰度主题），主题、玻璃强度、灰度、光学开关、背景、漂移与材质会持久化且不会闪烁（`theme-boot.js`）。工具栏是单行分组胶囊，侧栏可折叠（`Ctrl/⌘ + B`）并可拖动调整宽度（200–380px）。设置「外观」与主题面板共用同一份状态。
- macOS 保留原生红绿灯并隐藏自定义窗口按钮，品牌图标与文字位于右上；Windows/Linux 使用自定义最小化/最大化/关闭按钮，品牌在左。
- 标题栏、侧栏、搜索框与导航/操作工具栏簇由 WebGL2 光学层渲染：真实背景折射、Snell 近似、RGB 色散、Fresnel 边缘与指针高光。窗口控制是无外框图标，不参与玻璃表面。侧栏是单块光学玻璃，导航/来源行是普通 CSS 行；光学环境跟随核心的 dark/light 模型（只有明亮主题使用浅色环境）。
- 主内容区使用不透明静态舞台（类似 PDF-Reader 的 PDF 页），光学材质只留在 chrome 与侧栏；浮动控件用宿主 `--shadow-optical` 补深度。这样正文不会被全屏动画折射背景和半透明卡片削弱清晰度。
- 光学材质跟随 `liquid-glass-optics` 最新核心：18 项材质/接触阴影/边缘高光/反射参数，默认 Liquid 预设且接触阴影为 0；光学胶囊内按钮 hover 只改图标颜色，不叠加 CSS 第二层。
- 光学层只在透明的 chrome 层生效；modal / popover / toast / 阅读器仍是 CSS 玻璃，正文卡片保持实色，保证可读性与层叠正确。
- 「设置 → 外观」或主题面板可切换柔光渐变 / 光学标定 / 主题纯色 / 内置图片；光学标定显示同心环、点阵与制图线，折射与色散最明显；纯色没有可折射细节，但保留 tint、边缘高光与指针高光；内置图片使用与主题明暗匹配的 Optical Chart。背景漂移默认关闭，可单独开启。选择会保存在本机。
- 光学折射玻璃可在主题面板或设置中随时关闭，立即回到 CSS 玻璃；重新开启会重建渲染器与表面。
- WebGL2 不可用或系统启用「降低透明度」时，自动保留原 CSS 玻璃效果。

## 已知限制

- 部分站点有付费墙、反爬或 CSP，正文可能抽取失败；此时会显示来源摘要，并保留「在浏览器打开原文」。
- 只有**成功打开过**的文章才会缓存正文；第一次打开仍需要网络。已缓存的 AI 精读摘要会独立显示，即使正文暂时抓取失败也不会丢。
- Hacker News 的条目通常指向外部网页，部分页面不会提供可抽取的正文。
- 本地速读是抽取式摘要，保留原文语言；需要中文理解时使用可选的「AI 精读」。
- 「跟随本机 Claude Code」依赖 `~/.claude/settings.json`；如果该文件不存在，请在设置中改用 Anthropic / DeepSeek / 自定义接口。
- RSS 结构可能变化；如有来源失效，可在 `lib/sources.js` 替换为新的 feed 地址。
- 「今日热点」的事件聚合基于标题词重合的轻量启发式：同一事件在多家媒体报道时效果最好；中英文标题、措辞差异很大的报道可能不会合并。
- 新闻源可能有反爬或地区限制（尤其境外站点）；失败时保留旧缓存，并在来源旁显示错误提示，可切换代理后重试。
- AI 今日概览依赖所选模型的理解与 JSON 输出能力；模型偶发返回不可解析内容时会自动重试一次，仍失败则保留旧缓存并提示手动重试；指纹不匹配的旧概览不会冒充为今天的结果。概览只基于当天候选新闻的标题与摘要，可能出现概括偏差。
- WebGL 光学层持续以动画帧渲染，但程序化环境默认静止；只有开启「背景漂移」时色场才缓慢移动。在极低端集显上仍可能增加 GPU 占用，可在外观面板关闭光学。覆盖层使用 CSS 玻璃 fallback，不参与 WebGL 折射。

## 打包

仓库当前聚焦于开发运行，未内置安装包配置。可使用 `electron-builder` 或 `electron-forge` 基于 `package.json` 打包 Windows 安装程序；`build/icon.ico` 已可直接作为 Windows 图标使用。

## 第三方数据与词典

- **ECDICT**：离线英汉词库，MIT License，https://github.com/skywind3000/ECDICT 。本仓库只打包按常用词与考试标签筛选后的精简子集（`data/ecdict.json.gz`），用 `scripts/build-ecdict.js` 生成。
- **Cambridge Dictionary**：按单词按需查询英英/英汉页面，结果仅用于本机学习，并保留原页面链接；不批量抓取。
- **Wiktionary**：通过 `api.dictionaryapi.dev` 获取英英释义，CC BY-SA。

## License

MIT

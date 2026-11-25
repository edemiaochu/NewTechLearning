---
name: dictionary
description: 阅读器双击英文查词：Cambridge 英英 + 英汉 + 离线 ECDICT 英汉兜底，主进程抓取、解析与 30 天本地缓存
type: topic
updated: 2026-11-25
related: [[reader-experience]], [[networking-proxy]]
---

# 英文词典

## 行为

- 阅读器正文（`#reader-content`）内双击英文单词，弹出词典卡片，显示音标、英英释义、英汉翻译与例句。
- 只接受单个英文单词（字母、内部 `-` / `'`，最长 39 字符）；选中短语、数字或中文不触发。
- 双击链接、按钮、输入框或画笔开启时不触发。
- 卡片在鼠标位置弹出并夹紧在窗口内；点击外部、`Esc`、滚动阅读区、关闭文章、切换视图都会关闭。
- 设置 → 阅读与词典 可关闭双击查词（`fr.dictionaryOn`）或清除词典缓存。

## 数据源与限制

- **Cambridge Dictionary**：同时抓取
  - `https://dictionary.cambridge.org/dictionary/english/<word>`
  - `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/<word>`
  用 cheerio 提取 `.entry-body__el` / `.pos` / `.def-block` / `.def` / `.trans` / `.examp .eg` / `.trans` 与 `.pron .ipa`。
- **Oxford Learner's Dictionaries 未接入**：没有免费公开 API；官方 Oxford Dictionaries API 需要 Key；其 `robots.txt` 明确对 `anthropic-ai` / `Claude-Web` 等 UA 全站 Disallow。不要抓取 Oxford。
- Cambridge 的 `robots.txt` 允许词典页面（仅禁止 `/search/`、`/browse/`、`/autocomplete/` 等）。仍应保持按需单词查询、不批量爬取。
- 英英回退：Cambridge English 失败时使用 `https://api.dictionaryapi.dev/api/v2/entries/en/<word>`（Wiktionary 数据）。
- **英汉离线兜底：ECDICT**（MIT）。`data/ecdict.json.gz` 是精简子集：59,137 个词条 + 39,047 个词形映射，约 2.2MiB；只保留考试标签 / 柯林斯 / 牛津 / 词频前 10 万的常用词。Cambridge 英汉缺失时使用 ECDICT；网络失败时也用它离线显示，并提供「联网重查」。ECDICT 还提供音标、柯林斯星级、牛津 3000、考试标签（CET/GRE/…）与 `running → run` 这类词形还原。
- 查询需要网络（ECDICT 除外）；所有请求在主进程完成，使用 `fetchText` 的 `auto` 路由（直连优先，回退代理），渲染层不发网络请求。

## 实现

- `lib/dictionary.js`
  - `normalizeWord()`、`parseCambridge()`、`parseFreeDictionary()`、`DictionaryStore`。
  - 全局 350ms 最小请求间隔；同词并发请求复用 inflight Promise。
  - 缓存文件 `<userData>/dictionary-cache.json`，最多 600 词，30 天 TTL；成功结果才落盘。
  - 英文与中文两个 Cambridge 页面并行抓取；结果结构 `{ ok, word, phonetics, english[], chinese[], englishUrl, chineseUrl, englishSource, chineseSource, ecdict, offlineOnly }`。
  - ECDICT 数据懒加载（首次查词读取 `data/ecdict.json.gz` 并解压为内存 Map），不阻塞启动；`offlineOnly` 结果不写磁盘缓存，也不进渲染层内存缓存，便于「联网重查」。
- `scripts/build-ecdict.js`：从 ECDICT `ecdict.csv` 生成精简 `data/ecdict.json.gz`；输入需自行下载，脚本不联网。
- ECDICT 数据来源：https://github.com/skywind3000/ECDICT （MIT，保留版权声明）。
- `main.js`：启动时 `new DictionaryStore(...)` + `init()`；IPC `dictionary:lookup`、`dictionary:clear`。
- `preload.js`：`lookupDictionary(word, { force })`、`clearDictionaryCache()`。
- `src/js/state.js`：`state.ui.dictionaryOn`、`state.ui.dictionary`（临时查询状态）、`fr.dictionaryOn`。
- `src/js/app.js`：双击取词、位置夹紧、请求 token 防过期、内存 80 词缓存、重试、关闭时机。
- `src/js/views.js`：`renderDictionaryPopover()`、ECDICT 标签徽章、阅读器提示、设置「阅读与词典」。
- `src/styles/app.css`：`.dict-popover`、释义/例句/中文排版、`.reader-dict-hint`。

## 约束与坑

- Cambridge 页面结构可能变动；解析失败应显示「没有找到/网络不可用」并保留 Cambridge 打开链接，不要抛到渲染层。
- 不要抓取 Oxford；不要绕过反爬/验证码/付费墙。
- 不要把整页 HTML 或大量释义长期缓存；只缓存单词查询结果，保留来源链接。
- 词典卡片是 CSS 玻璃覆盖层，不注册 WebGL 表面，避免与阅读器遮罩层叠冲突。
- `#reader-content` 是局部刷新区域；词典弹层挂在 `#overlay-root`，刷新正文不会清掉它（切文章/滚动会主动关闭）。
- 双引号/撇号会统一为 ASCII `'`；`normalizeWord` 会去掉首尾标点，避免把句号带入 URL。

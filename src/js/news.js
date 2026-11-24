/* News module helpers: today's scope, cross-source event clustering, keywords. */

import { allItems, state } from './state.js';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before
  being below between both but by can could did do does doing down during each few for from
  further get gets got had has have having he her here hers herself him himself his how i if
  in into is it its itself just know like make makes many may me might more most much must my
  myself new news no nor not now of off on once one only or other our ours ourselves out over
  own said same say says see she should since so some such than that the their theirs them
  themselves then there these they this those through to too two under until up us very was
  we were what when where which while who whom why will with would you your yours yourself
  yourselves tech technology technologies digital internet software hardware mobile app apps
  online computer computers platform platforms product products company companies business
  businesses market markets industry industries global world report reports report says said
  according source sources exclusive analysis opinion review reviews best top latest live
  breaking update updates today tomorrow yesterday week month year first last next launches
  launch launched announces announced unveils unveiled introduces introduced plan plans set
  sets use uses using big ceo cto coo founder founders user users people inside
  return returns scandal reportedly allegedly model models team teams`
    .split(/\s+/)
    .filter(Boolean)
);

const CJK_STOPWORDS = new Set(
  `的 了 是 在 和 与 及 或 将 已 等 这 那 其 为 于 对 从 到 被 把 让 向 由 以 并 而 也 都 就
  还 又 更 最 很 不 没 没有 有 一个 一种 我们 他们 你们 公司 科技 技术 产品 服务 用户
  市场 行业 全球 世界 中国 美国 日本 韩国 欧洲 今日 最新 消息 报道 宣布 发布 推出 正式
  首次 再次 继续 相关 方面 问题 情况 工作 系统 数据 平台 网络 智能 人工智能 手机 芯片
  今天 昨天 本周 今年 如何 为什么 什么 哪些 这个 那个 可以 可能 已经 正在 进行 表示 认为
  记者 编辑 来源 标题 点击 查看 阅读 详情 原文 亿元 亿美元 万美元 百万 千万 时间 目前
  昨日 上月 上线 亮相 曝光 公布 显示 使用 支持 提供 实现 成为 获 得 以及 同时 此外 近
  日 月 年 元 万 亿`
    .split(/\s+/)
    .filter(Boolean)
);

let segmenter = null;
try {
  segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
} catch {
  segmenter = null;
}

const titleCache = new Map();

export function itemTime(item) {
  const time = item?.publishedAt ? Date.parse(item.publishedAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

export function startOfToday(now = Date.now()) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isLowSignal(item) {
  return (
    item?.sourceId === 'hn' &&
    /(is hiring|who is hiring)/i.test(String(item?.title || ''))
  );
}

export function newsItems() {
  const newsSourceIds = new Set(
    state.sources.filter((source) => source.news).map((source) => source.id)
  );
  return allItems().filter(
    (item) => newsSourceIds.has(item.sourceId) && !isLowSignal(item)
  );
}

export function newsSourceList() {
  return state.sources.filter((source) => source.news);
}

export function isWorldItem(item) {
  return !!item?.source?.world;
}

/**
 * Prefer today's local-day items. If there are only a handful (timezone or a
 * quiet morning), fall back to the last 24 hours and label the scope honestly.
 */
export function selectScope(items, now = Date.now()) {
  const list = [...(items || [])].sort((a, b) => itemTime(b) - itemTime(a));
  const start = startOfToday(now);
  const today = list.filter((item) => itemTime(item) >= start);
  if (today.length >= 6) {
    return { items: today, scope: 'today', label: '今日' };
  }
  const since = now - DAY;
  const recent = list.filter((item) => itemTime(item) >= since);
  if (recent.length) {
    return { items: recent, scope: '24h', label: '近 24 小时' };
  }
  return { items: list.slice(0, 30), scope: 'latest', label: '最新' };
}

/**
 * Cache key for the AI daily digest: changes when the selected day's item set
 * or the active AI provider/model changes.
 */
export function digestFingerprint(scope) {
  const items = scope?.items || [];
  let hash = 2166136261;
  for (const item of items) {
    const id = String(item.id || '');
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  const aiProvider = state.settings?.aiProvider || 'local-claude';
  const aiModel =
    aiProvider === 'local-claude'
      ? state.settings?.localConfig?.model || ''
      : state.settings?.aiModel || '';
  const aiKey = `${aiProvider}:${aiModel}`;
  const day = new Date().toDateString();
  return `${day}|${scope?.scope || 'today'}|${items.length}|${(hash >>> 0).toString(
    16
  )}|${aiKey}`;
}

/** Tokenize a headline into comparable terms; keeps display casing for keywords. */
export function analyzeTitle(title) {
  const source = String(title || '');
  if (titleCache.has(source)) return titleCache.get(source);
  const tokens = new Set();
  const display = new Map();

  const consider = (raw, isStrong) => {
    const word = String(raw)
      .toLowerCase()
      .replace(/^[^a-z0-9一-鿿]+|[^a-z0-9一-鿿]+$/g, '');
    if (!word || word.length < 2) return;
    if (STOPWORDS.has(word) || CJK_STOPWORDS.has(word)) return;
    tokens.add(word);
    const existing = display.get(word);
    if (!existing || (isStrong && String(raw).length > existing.length)) {
      display.set(word, String(raw).trim());
    }
  };

  for (const raw of source.match(/[A-Za-z0-9][A-Za-z0-9+.#_-]{1,30}/g) || []) {
    if (raw.length < 3) continue;
    consider(raw, /[A-Z]/.test(raw));
  }

  for (const chunk of source.match(/[一-鿿]+/g) || []) {
    if (segmenter) {
      for (const part of segmenter.segment(chunk)) {
        if (part.isWordLike && part.segment.length >= 2) {
          consider(part.segment, false);
        }
      }
    } else {
      for (let i = 0; i < chunk.length - 1; i += 1) {
        consider(chunk.slice(i, i + 2), false);
      }
    }
  }

  const result = { tokens, display };
  if (titleCache.size > 800) titleCache.clear();
  titleCache.set(source, result);
  return result;
}

function overlap(a, b) {
  const [small, large] = a.tokens.size <= b.tokens.size ? [a, b] : [b, a];
  let inter = 0;
  for (const token of small.tokens) {
    if (large.tokens.has(token)) inter += 1;
  }
  return {
    inter,
    ratio: inter / Math.max(1, Math.min(a.tokens.size, b.tokens.size)),
  };
}

/**
 * Group headlines that describe the same event. Require at least two terms in
 * common and at least 40% overlap; generic tech words are removed above so
 * unrelated "AI" stories do not collapse together.
 */
export function buildHotEvents(items, now = Date.now()) {
  const entries = (items || [])
    .map((item) => {
      const words = analyzeTitle(item.title);
      return {
        item,
        tokens: words.tokens,
        time: itemTime(item),
        heat: Math.min(500, Number(item.meta?.points) || 0),
      };
    })
    .sort((a, b) => b.time - a.time);

  const clusters = [];
  for (const entry of entries) {
    let target = null;
    let targetScore = 0;
    for (const cluster of clusters) {
      for (const member of cluster.entries) {
        const match = overlap(entry, member);
        if (match.inter >= 2 && match.ratio >= 0.4) {
          const score = match.inter * 2 + match.ratio;
          if (score > targetScore) {
            target = cluster;
            targetScore = score;
          }
          break;
        }
      }
    }
    if (target) target.entries.push(entry);
    else clusters.push({ entries: [entry] });
  }

  return clusters
    .map((cluster) => {
      const members = [...cluster.entries].sort((a, b) => b.time - a.time);
      const representative =
        members.find((entry) => String(entry.item.summary || '').trim().length >= 60) ||
        members[0];
      const sources = [];
      const seen = new Set();
      for (const member of members) {
        const source = member.item.source;
        if (source && !seen.has(source.id)) {
          seen.add(source.id);
          sources.push(source);
        }
      }
      const newestAt = Math.max(...members.map((entry) => entry.time));
      const heat = Math.max(...members.map((entry) => entry.heat));
      const ageHours = Math.max(0, (now - newestAt) / HOUR);
      const recency = Math.max(0, 36 - ageHours);
      return {
        id: representative.item.id,
        title: representative.item.title,
        summary: representative.item.summary,
        source: representative.item.source,
        sources,
        coverage: sources.length,
        members: members.map((entry) => entry.item),
        newestAt,
        heat,
        score: sources.length * 400 + heat * 1.4 + recency * 2,
      };
    })
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        b.score - a.score ||
        b.newestAt - a.newestAt
    );
}

/** Terms that appear across multiple sources make the best daily keywords. */
export function keywordsOf(items, limit = 8) {
  const stats = new Map();
  for (const item of items || []) {
    const words = analyzeTitle(item.title);
    for (const token of words.tokens) {
      let entry = stats.get(token);
      if (!entry) {
        entry = {
          token,
          display: words.display.get(token) || token,
          count: 0,
          sources: new Set(),
        };
        stats.set(token, entry);
      }
      entry.count += 1;
      if (item.sourceId) entry.sources.add(item.sourceId);
    }
  }

  const all = [...stats.values()].filter((entry) => entry.count >= 2);
  const shared = all.filter((entry) => entry.sources.size >= 2);
  return (shared.length ? shared : all)
    .sort(
      (a, b) =>
        b.sources.size - a.sources.size ||
        b.count - a.count ||
        b.display.length - a.display.length
    )
    .slice(0, limit)
    .map((entry) => entry.display);
}

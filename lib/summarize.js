/**
 * Small, dependency-free extractive summarizer.
 * Works for English + Chinese text and is intentionally conservative:
 * it only surfaces sentences that already exist in the article.
 */

const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves
  also just like get got make made new news one two three now may might many much will can could would should really thing things something someone way ways time times week weeks day days year years first last next post posts read more less about via using use used work works working
  since while across within without based however therefore thus even still often both each every either neither another other such many more most less least through during before after above below between among around toward towards per via versus vs etc
  subscribe newsletter sign up follow share read cookie cookies privacy policy terms rights reserved advertisement sponsored`
    .split(/\s+/)
    .filter(Boolean)
);

const ZH_STOP_BIGRAMS = new Set([
  '我们', '你们', '他们', '这个', '那个', '这些', '那些', '一个', '一种', '一些',
  '可以', '可能', '已经', '没有', '不是', '就是', '以及', '但是', '因为', '所以',
  '如果', '而且', '并且', '或者', '还是', '这样', '那样', '其中', '对于', '通过',
  '进行', '使用', '需要', '能够', '已经', '目前', '现在', '今天', '今年', '自己',
  '什么', '怎么', '如何', '为了', '由于', '根据', '关于', '之间', '之后', '之前',
  '我们', '他们', '它们', '这种', '那种', '一种', '一直', '非常', '很多', '更加',
]);

const BOILERPLATE = /(subscribe|newsletter|sign up|log in|read more|all rights reserved|cookie|privacy policy|terms of service|follow us|share this|advertisement|sponsored|点击订阅|扫码|版权声明|免责声明)/i;

function blockText(block) {
  if (!block) return '';
  if (block.type === 'heading') return block.text || '';
  if (block.type === 'paragraph' || block.type === 'quote') return block.text || '';
  if (block.type === 'list') return (block.items || []).map(blockText).join(' ');
  if (block.type === 'code') return block.text || '';
  return block.text || '';
}

function plainTextFromBlocks(blocks, options = {}) {
  const includeHeadings = options.includeHeadings !== false;
  return (blocks || [])
    .filter((block) => includeHeadings || block.type !== 'heading')
    .map((block) => {
      if (block.type === 'list') {
        return (block.items || []).map((item) => item.text || '').join('\n');
      }
      return blockText(block);
    })
    .filter(Boolean)
    .join('\n\n');
}

function splitSentences(text) {
  const normalized = String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/([。！？!?])["”’)]*/g, '$1\n')
    .replace(/([.!?])\s+(?=[A-Z0-9“"'(])/g, '$1\n')
    .trim();

  const raw = normalized
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const sentences = [];
  for (let s of raw) {
    if (s.length < 18) continue;
    if (BOILERPLATE.test(s) && s.length < 220) continue;
    if (s.length > 620) {
      const chunks = s.match(/.{1,420}(?:[.!?。！？]|$)/g) || [s.slice(0, 420)];
      for (const chunk of chunks) {
        if (chunk.trim().length >= 18) sentences.push(chunk.trim());
      }
    } else {
      sentences.push(s);
    }
    if (sentences.length >= 140) break;
  }
  return sentences;
}

function tokenize(sentence) {
  const tokens = [];
  const lower = String(sentence || '').toLowerCase();
  const english = lower.match(/[a-z][a-z0-9'-]{2,}/g) || [];
  for (const word of english) {
    const clean = word.replace(/^[^a-z]+|[^a-z]+$/g, '');
    if (clean.length >= 3 && !STOPWORDS.has(clean)) tokens.push(clean);
  }
  const chinese = lower.match(/[一-鿿]{2,}/g) || [];
  for (const run of chinese) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (!ZH_STOP_BIGRAMS.has(bigram)) tokens.push(bigram);
    }
    if (run.length >= 3 && run.length <= 6 && !ZH_STOP_BIGRAMS.has(run)) tokens.push(run);
  }
  return tokens;
}

function dedupeSentences(sentences) {
  const seen = new Set();
  const out = [];
  for (const sentence of sentences) {
    const key = sentence.slice(0, 64).toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sentence);
  }
  return out;
}

function clampSentence(sentence, max = 260) {
  const text = sentence.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const atSpace = cut.lastIndexOf(' ');
  let atPunct = -1;
  // Only treat punctuation as a sentence end when it is followed by a space
  // or the end of the string, so decimals like 0.89 are not cut in half.
  for (const match of cut.matchAll(/[。！？；]|[.!?](?=\s|$)/g)) {
    const idx = match.index;
    if (
      match[0] === '.' &&
      idx === cut.length - 1 &&
      /\d/.test(cut[idx - 1] || '') &&
      /\d/.test(text[idx + 1] || '')
    ) {
      continue;
    }
    atPunct = idx;
  }
  if (atPunct > max * 0.55) return cut.slice(0, atPunct + 1).trim();
  return (atSpace > max * 0.6 ? cut.slice(0, atSpace) : cut).trim() + '…';
}

function countReadingUnits(text) {
  const english = (String(text).match(/[A-Za-z0-9]+/g) || []).length;
  const chinese = (String(text).match(/[一-鿿]/g) || []).length;
  return { english, chinese, units: english + chinese / 2.1 };
}

function summarize(text, options = {}) {
  const { maxBullets = 5, maxKeywords = 8 } = options;
  const cleanText = String(text || '').trim();
  const sentences = dedupeSentences(splitSentences(cleanText));

  const { english, chinese, units } = countReadingUnits(cleanText);
  const readMinutes = Math.max(1, Math.ceil(units / 220));

  if (!sentences.length) {
    const fallback = cleanText.slice(0, 260).trim();
    return {
      bullets: fallback ? [fallback] : [],
      keywords: [],
      hook: fallback,
      readMinutes,
      wordCount: english + chinese,
    };
  }

  const sentenceTokens = sentences.map((s) => tokenize(s));
  const tf = new Map();
  const display = new Map();
  sentenceTokens.forEach((tokens, index) => {
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
      if (!display.has(token)) display.set(token, token);
    }
    // Register display casing for English words from the original sentence.
    const orig = sentences[index].match(/[A-Za-z][A-Za-z0-9'-]{2,}/g) || [];
    for (const word of orig) {
      const key = word.toLowerCase();
      if (!display.has(key) || display.get(key) === key) display.set(key, word);
    }
  });

  const scored = sentences.map((sentence, index) => {
    const tokens = sentenceTokens[index];
    if (!tokens.length) return { sentence, index, score: 0 };
    let score = 0;
    for (const token of tokens) score += tf.get(token) || 0;
    score /= Math.sqrt(tokens.length);
    if (index < 3) score *= 1.28;
    if (index === 0) score *= 1.12;
    if (sentence.length > 60 && sentence.length < 420) score *= 1.08;
    if (/^[A-Z0-9][^.!?]{0,80}[.!?]$/.test(sentence) && sentence.length < 90) {
      score *= 0.9;
    }
    return { sentence, index, score };
  });

  const picked = [];
  const used = new Set();
  for (const candidate of [...scored].sort((a, b) => b.score - a.score)) {
    if (picked.length >= maxBullets) break;
    const key = candidate.sentence.slice(0, 64).toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    picked.push(candidate);
  }
  picked.sort((a, b) => a.index - b.index);

  const bullets = picked.map((c) => clampSentence(c.sentence));

  const keywordRank = [...tf.entries()]
    .filter(([token, count]) => {
      if (count < 2) return false;
      if (token.length < 2) return false;
      if (/^\d+$/.test(token)) return false;
      if (STOPWORDS.has(token)) return false;
      return true;
    })
    .sort((a, b) => b[1] - a[1]);

  const keywords = [];
  for (const [token] of keywordRank) {
    if (keywords.length >= maxKeywords) break;
    if (keywords.some((word) => word.toLowerCase().includes(token) || token.includes(word.toLowerCase()))) {
      continue;
    }
    const label = display.get(token) || token;
    keywords.push(label.length > 24 ? label.slice(0, 24) : label);
  }

  return {
    bullets,
    keywords,
    hook: sentences[0] || '',
    readMinutes,
    wordCount: english + chinese,
  };
}

module.exports = { summarize, plainTextFromBlocks, splitSentences, countReadingUnits };

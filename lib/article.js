const { fetchText, isHttpUrl, DEFAULT_UA } = require('./net');
const { summarize, plainTextFromBlocks } = require('./summarize');

let cheerioModule = null;
function cheerio() {
  if (!cheerioModule) {
    // eslint-disable-next-line global-require
    cheerioModule = require('cheerio');
  }
  return cheerioModule;
}

const CANDIDATE_SELECTORS = [
  'article',
  '[role="main"] article',
  'main article',
  '.post-content',
  '.article-content',
  '.entry-content',
  '.story-body',
  '.prose',
  '.blog-post',
  'main',
  '[role="main"]',
  '#content',
  '.content',
];

const SKIP_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'iframe',
  'form',
  'nav',
  'footer',
  'aside',
  'button',
  'svg',
  'video',
  'audio',
  'canvas',
  'input',
  'select',
  'textarea',
  'template',
]);

const BOILERPLATE_PARA =
  /^(advertisement|subscribe|sign up|newsletter|share this|share|read more|related stories|related articles|follow us|cookie|we use cookies|accept all|manage preferences|loading|skip to content|back to top|©|copyright|all rights reserved)/i;

const cache = new Map();
const MAX_CACHE = 40;
const MAX_CONTENT_CHARS = 60000;

function resolveUrl(href, base) {
  if (!href) return '';
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.href;
  } catch {
    return '';
  }
}

function normalizeText(text) {
  return String(text || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inlineRuns($, node, baseUrl) {
  const runs = [];

  function push(value, style) {
    if (!value) return;
    const last = runs[runs.length - 1];
    if (
      last &&
      !!last.bold === !!style.bold &&
      !!last.italic === !!style.italic &&
      !!last.code === !!style.code &&
      (last.href || '') === (style.href || '')
    ) {
      last.text += value;
    } else {
      runs.push({
        text: value,
        bold: !!style.bold,
        italic: !!style.italic,
        code: !!style.code,
        href: style.href || '',
      });
    }
  }

  function visit(n, style) {
    if (!n) return;
    if (n.type === 'text') {
      push(n.data, style);
      return;
    }
    if (n.type !== 'tag') return;

    const tag = String(n.name || '').toLowerCase();
    if (tag === 'br') {
      push(' ', style);
      return;
    }
    if (['script', 'style', 'noscript', 'button', 'form', 'svg', 'img'].includes(tag)) return;

    let next = style;
    if (tag === 'strong' || tag === 'b') next = { ...next, bold: true };
    if (tag === 'em' || tag === 'i') next = { ...next, italic: true };
    if (tag === 'code' && n.parent?.name !== 'pre') next = { ...next, code: true };
    if (tag === 'a') {
      const href = resolveUrl(n.attribs?.href, baseUrl);
      if (href) next = { ...next, href };
    }

    for (const child of n.children || []) visit(child, next);
  }

  visit(node, {});
  return mergeRuns(runs);
}

function mergeRuns(runs) {
  const out = [];
  for (const run of runs) {
    const text = run.text.replace(/\s+/g, ' ');
    if (!text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      last.bold === run.bold &&
      last.italic === run.italic &&
      last.code === run.code &&
      last.href === run.href
    ) {
      last.text += text;
    } else {
      out.push({ ...run, text });
    }
  }
  if (out.length) {
    out[0].text = out[0].text.replace(/^ +/, '');
    out[out.length - 1].text = out[out.length - 1].text.replace(/ +$/, '');
  }
  return out.filter((r) => r.text.length);
}

function runsToText(runs) {
  return normalizeText((runs || []).map((r) => r.text).join(''));
}

function runsFromText(text) {
  const clean = normalizeText(text);
  return clean ? [{ text: clean, bold: false, italic: false, code: false, href: '' }] : [];
}

function extractMeta($, pageUrl) {
  const og = (prop) => $(`meta[property="${prop}"]`).attr('content') || '';
  const name = (n) => $(`meta[name="${n}"]`).attr('content') || '';
  const title =
    normalizeText(og('og:title') || name('twitter:title') || $('h1').first().text() || $('title').text()) ||
    '未命名文章';
  const siteName = normalizeText(og('og:site_name') || new URL(pageUrl).hostname.replace(/^www\./, ''));
  const author = normalizeText(
    name('author') || $('[rel="author"]').first().text() || $('.byline').first().text() || ''
  ).slice(0, 120);
  const published =
    name('article:published_time') || og('article:published_time') || name('date') || '';
  return { title, siteName, author, published };
}

function pickRoot($) {
  let best = null;
  let bestScore = 0;
  for (const selector of CANDIDATE_SELECTORS) {
    $(selector).each((_, node) => {
      const $node = $(node);
      if ($node.closest('nav, footer, aside, form').length) return;
      const paragraphText = $node.find('p').text().replace(/\s+/g, ' ').trim();
      const paragraphCount = $node.find('p').length;
      const headingCount = $node.find('h2, h3').length;
      const score = paragraphText.length + paragraphCount * 180 + headingCount * 60;
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    });
  }
  return { root: best, score: bestScore };
}

function extractHtmlArticle(html, pageUrl) {
  const { load } = cheerio();
  const $ = load(html);
  const meta = extractMeta($, pageUrl);

  // arXiv abstract pages: extract the abstract itself, not the surrounding
  // site chrome (breadcrumb, "Title:", "Authors:", submission history…).
  let host = '';
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = '';
  }
  if (/(^|\.)arxiv\.org$/i.test(host) && /\/abs\//.test(pageUrl)) {
    const abstractEl = $('blockquote.abstract').first();
    const abstractText = normalizeText(abstractEl.text()).replace(/^Abstract:\s*/i, '');
    if (abstractText.length > 60) {
      const title =
        normalizeText($('h1.title').first().text()).replace(/^Title:\s*/i, '') || meta.title;
      const authors = normalizeText($('div.authors').first().text())
        .replace(/^Authors?:\s*/i, '')
        .slice(0, 300);
      const subjects = normalizeText($('td.tablecell.subjects').first().text())
        .replace(/^Subjects?:\s*/i, '')
        .slice(0, 200);
      const blocks = [
        { type: 'paragraph', text: abstractText, runs: runsFromText(abstractText) },
      ];
      if (subjects) {
        blocks.push({
          type: 'quote',
          text: `学科分类：${subjects}`,
          runs: runsFromText(`学科分类：${subjects}`),
        });
      }
      return {
        ok: true,
        title,
        siteName: 'arXiv',
        author: authors,
        published: '',
        blocks,
        text: plainTextFromBlocks(blocks),
      };
    }
  }

  const { root, score } = pickRoot($);
  if (!root || score < 240) {
    return { ok: false, reason: '无法识别正文区域', meta };
  }

  const $root = $(root).clone();
  $root
    .find(
      'script, style, noscript, iframe, form, nav, footer, aside, button, svg, video, audio, canvas, input, select, textarea, template'
    )
    .remove();
  $root
    .find(
      '[class*="newsletter"], [class*="subscribe"], [class*="cookie"], [class*="advert"], [id*="newsletter"], [class*="social-share"], [class*="share-tools"]'
    )
    .remove();

  const blocks = [];
  let charCount = 0;
  let lastKey = '';

  function emit(block) {
    if (!block) return false;
    if (charCount > MAX_CONTENT_CHARS || blocks.length > 260) return true;
    const text = block.type === 'list' ? block.items.map((i) => i.text).join(' ') : block.text || '';
    if (block.type !== 'divider' && !text.trim()) return false;
    const key = `${block.type}:${text.slice(0, 80).toLowerCase()}`;
    if (key === lastKey) return false;
    lastKey = key;
    blocks.push(block);
    charCount += text.length;
    return charCount > MAX_CONTENT_CHARS || blocks.length > 260;
  }

  function walk(node) {
    for (const child of node.children || []) {
      if (charCount > MAX_CONTENT_CHARS || blocks.length > 260) return;
      if (!child || child.type !== 'tag') continue;
      const tag = String(child.name || '').toLowerCase();
      if (SKIP_TAGS.has(tag)) continue;

      if (/^h[1-6]$/.test(tag)) {
        const text = normalizeText($(child).text());
        if (!text || text.length > 240) continue;
        if (tag === 'h1' && text === meta.title) continue;
        emit({ type: 'heading', level: Number(tag[1]), text });
        continue;
      }

      if (tag === 'p') {
        const runs = inlineRuns($, child, pageUrl);
        const text = runsToText(runs);
        if (!text || text.length < 2) continue;
        if (text.length < 180 && BOILERPLATE_PARA.test(text)) continue;
        emit({ type: 'paragraph', text, runs });
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const items = [];
        $(child)
          .children('li')
          .each((_, li) => {
            const runs = inlineRuns($, li, pageUrl);
            // Nested lists: keep their text in the same item.
            const text = runsToText(runs);
            if (text) items.push({ text, runs });
          });
        if (items.length) {
          emit({ type: 'list', ordered: tag === 'ol', items });
        }
        continue;
      }

      if (tag === 'blockquote') {
        const text = normalizeText($(child).text());
        if (text.length >= 4) emit({ type: 'quote', text, runs: runsFromText(text) });
        continue;
      }

      if (tag === 'pre') {
        const text = $(child).text().replace(/\n{3,}/g, '\n\n').trim();
        if (text) {
          const langClass = $(child).find('code').attr('class') || '';
          const lang = (langClass.match(/language-([\w-]+)/) || [])[1] || '';
          emit({ type: 'code', text: text.slice(0, 12000), lang });
        }
        continue;
      }

      if (tag === 'hr') {
        emit({ type: 'divider' });
        continue;
      }

      if (tag === 'table') {
        const rows = [];
        $(child)
          .find('tr')
          .each((_, tr) => {
            const cells = $(tr)
              .find('th, td')
              .map((__, cell) => normalizeText($(cell).text()))
              .get()
              .filter(Boolean);
            if (cells.length) rows.push(cells.join(' | '));
          });
        if (rows.length) {
          emit({ type: 'paragraph', text: rows.join('\n'), runs: runsFromText(rows.join(' ')) });
        }
        continue;
      }

      if (tag === 'figure') {
        const caption = normalizeText($(child).find('figcaption').text());
        if (caption) emit({ type: 'quote', text: caption, runs: runsFromText(caption) });
        continue;
      }

      if (tag === 'img') continue;

      if (['div', 'section', 'article', 'main', 'header', 'span', 'body'].includes(tag)) {
        walk(child);
        continue;
      }

      // Inline-ish leftovers with no paragraph children become a paragraph.
      if (!$(child).find('p, h2, h3, li, blockquote, pre').length) {
        const runs = inlineRuns($, child, pageUrl);
        const text = runsToText(runs);
        if (text.length > 30 && !(text.length < 180 && BOILERPLATE_PARA.test(text))) {
          emit({ type: 'paragraph', text, runs });
        }
      } else {
        walk(child);
      }
    }
  }

  walk(root);

  // If the picked root is a single paragraph (some sites wrap everything in <p>), keep it.
  if (!blocks.length && $(root).is('p')) {
    const runs = inlineRuns($, root, pageUrl);
    const text = runsToText(runs);
    if (text) blocks.push({ type: 'paragraph', text, runs });
  }

  const text = plainTextFromBlocks(blocks);
  if (text.length < 120 || blocks.length < 2) {
    return { ok: false, reason: '正文内容过短', meta, blocks };
  }

  return { ok: true, ...meta, blocks, text };
}

/* ------------------------------------------------------------------ */
/* claude.dev also publishes clean Markdown at <post>.md               */
/* ------------------------------------------------------------------ */

function mdInline(text, baseUrl) {
  const runs = [];
  const source = String(text || '');
  const linkRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let cursor = 0;
  let match;
  const pushPlain = (chunk) => {
    const plain = chunk
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/\*([^*\n]+)\*/g, '$1')
      .replace(/_([^_\n]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1');
    if (plain) runs.push({ text: plain, bold: false, italic: false, code: false, href: '' });
  };
  while ((match = linkRegex.exec(source))) {
    pushPlain(source.slice(cursor, match.index));
    const href = resolveUrl(match[2], baseUrl);
    runs.push({
      text: match[1],
      bold: false,
      italic: false,
      code: false,
      href,
    });
    cursor = match.index + match[0].length;
  }
  pushPlain(source.slice(cursor));
  return mergeRuns(runs);
}

function markdownToBlocks(markdown, pageUrl, titleHint) {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const raw = paragraph.join(' ').trim();
    paragraph = [];
    if (!raw) return;
    // claude.dev's .md export ends with a "Further reading" link list.
    if (/^(\*\*)?further reading[.:]?/i.test(raw)) return;
    const runs = mdInline(raw, pageUrl);
    const text = runsToText(runs);
    if (text) blocks.push({ type: 'paragraph', text, runs });
  };

  const flushList = () => {
    if (!list) return;
    if (list.items.length) blocks.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      flushParagraph();
      flushList();
      const lang = trimmed.slice(3).trim();
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      const text = code.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text) blocks.push({ type: 'code', text, lang });
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = normalizeText(heading[2].replace(/[*_`]/g, ''));
      if (text && !(level === 1 && text === titleHint)) {
        blocks.push({ type: 'heading', level: Math.max(2, level), text });
      }
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push({ type: 'divider' });
      continue;
    }

    if (/^!\[[^\]]*\]\([^)]*\)$/.test(trimmed)) {
      flushParagraph();
      flushList();
      continue;
    }

    const listMatch = trimmed.match(/^(?:[-*+]|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const ordered = /^\d/.test(trimmed);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { type: 'list', ordered, items: [] };
      }
      const runs = mdInline(listMatch[1], pageUrl);
      const text = runsToText(runs);
      // Skip the article metadata block (Author / Published / URL) that
      // claude.dev puts at the top of each markdown export.
      if (text && !/^(author|published|url|reading time|tags)\s*:/i.test(text)) {
        list.items.push({ text, runs });
      }
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      i -= 1;
      const text = normalizeText(quoteLines.join(' '));
      if (text) blocks.push({ type: 'quote', text, runs: mdInline(text, pageUrl) });
      continue;
    }

    if (/^\|.*\|$/.test(trimmed)) {
      continue; // Markdown tables are skipped in the reader.
    }

    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();

  return blocks;
}

function extractMarkdownTitle(markdown) {
  const match = String(markdown || '').match(/^\s*#\s+(.+)$/m);
  if (!match) return '';
  return normalizeText(match[1].replace(/[*_`]/g, ''));
}

async function fetchClaudeMarkdown(item, options = {}) {
  if (!/^https:\/\/claude\.dev\/blog\//i.test(item.link)) return null;
  const mdUrl = `${item.link.replace(/\/+$/, '')}.md`;
  try {
    const res = await fetchText(mdUrl, {
      timeout: 15000,
      accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.5',
      route: options.route || 'proxy',
    });
    const text = res.text || '';
    if (!text || text.length < 200) return null;
    if (/^\s*<!doctype|^\s*<html/i.test(text)) return null;
    return { markdown: text, url: mdUrl };
  } catch {
    return null;
  }
}

async function extractFromUrl(item, options = {}) {
  if (!isHttpUrl(item.link)) throw new Error('无效的文章链接');
  const res = await fetchText(item.link, {
    timeout: 20000,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    headers: { 'User-Agent': DEFAULT_UA },
    route: options.route || 'proxy',
  });
  if (!res.text || res.text.length < 300) throw new Error('页面内容为空');
  const extracted = extractHtmlArticle(res.text, res.url || item.link);
  if (!extracted.ok) throw new Error(extracted.reason || '正文解析失败');
  return extracted;
}

function finishResult(item, extracted, source) {
  const blocks = extracted.blocks || [];
  const text = extracted.text || plainTextFromBlocks(blocks);
  const summary = summarize(plainTextFromBlocks(blocks, { includeHeadings: false }));
  const result = {
    ok: true,
    id: item.id,
    url: item.link,
    title: extracted.title || item.title || '未命名文章',
    siteName: extracted.siteName || '',
    author: extracted.author || '',
    publishedAt: extracted.published || item.publishedAt || '',
    blocks,
    text: text.slice(0, MAX_CONTENT_CHARS),
    summary,
    extractedWith: source,
    fetchedAt: new Date().toISOString(),
  };
  return result;
}

async function loadArticle(item, options = {}) {
  if (!item || !item.link) throw new Error('缺少文章链接');
  const cacheKey = item.link;
  if (cache.has(cacheKey)) {
    const hit = cache.get(cacheKey);
    cache.delete(cacheKey);
    cache.set(cacheKey, hit);
    return hit;
  }

  let extracted = null;
  let source = '';

  if (item.sourceId === 'claude') {
    const md = await fetchClaudeMarkdown(item, options);
    if (md) {
      const blocks = markdownToBlocks(md.markdown, item.link, item.title);
      const text = plainTextFromBlocks(blocks);
      if (blocks.length >= 2 && text.length >= 120) {
        extracted = {
          ok: true,
          title: extractMarkdownTitle(md.markdown) || item.title,
          siteName: 'claude.dev',
          author: '',
          published: '',
          blocks,
          text,
        };
        source = 'markdown';
      }
    }
  }

  if (!extracted) {
    extracted = await extractFromUrl(item, options);
    source = 'html';
  }

  const result = finishResult(item, extracted, source);
  cache.set(cacheKey, result);
  if (cache.size > MAX_CACHE) {
    cache.delete(cache.keys().next().value);
  }
  return result;
}

module.exports = { loadArticle, extractHtmlArticle, markdownToBlocks };

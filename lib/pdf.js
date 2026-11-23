const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow } = require('electron');
const { isHttpUrl } = require('./net');

const PDF_STYLES = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #1f2937;
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC",
      "Noto Sans CJK SC", -apple-system, "Segoe UI", sans-serif;
    font-size: 11.5pt;
    line-height: 1.8;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  a { color: #5b21b6; text-decoration: none; border-bottom: 1px solid #ddd6fe; word-break: break-word; }
  .kicker {
    margin-bottom: 8px;
    color: #7c3aed;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0 0 8px;
    color: #111827;
    font-size: 23pt;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1.3;
  }
  .meta {
    margin-bottom: 18px;
    color: #6b7280;
    font-size: 9pt;
    line-height: 1.6;
  }
  .meta .sep { margin: 0 6px; color: #d1d5db; }
  .box {
    margin: 16px 0;
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fafafa;
    break-inside: auto;
  }
  .summary { background: #f7f5ff; border-color: #ddd6fe; break-inside: avoid; }
  .ai { background: #f2f8ff; border-color: #bfdbfe; }
  .note { background: #f8fafc; border-color: #e2e8f0; break-inside: avoid; }
  .box h2 {
    margin: 0 0 8px;
    color: #5b21b6;
    font-size: 12pt;
    line-height: 1.4;
  }
  .box h3 {
    margin: 12px 0 4px;
    color: #374151;
    font-size: 10.5pt;
    line-height: 1.5;
  }
  .box ul, .box ol { margin: 6px 0 0; padding-left: 18px; }
  .box li { margin: 4px 0; font-size: 10.5pt; line-height: 1.75; }
  .badge {
    margin-left: 6px;
    color: #6b7280;
    font-size: 8.5pt;
    font-weight: 400;
  }
  .keywords { margin-top: 10px; }
  .keyword {
    display: inline-block;
    margin: 0 4px 4px 0;
    padding: 1px 7px;
    border: 1px solid #e5e7eb;
    border-radius: 999px;
    background: #ffffff;
    color: #6b7280;
    font-size: 8.5pt;
  }
  .tldr {
    margin: 0 0 8px;
    color: #1f2937;
    font-size: 12pt;
    font-weight: 600;
    line-height: 1.7;
  }
  .term { display: flex; gap: 8px; margin: 4px 0; font-size: 10pt; }
  .term dt { width: 96px; flex-shrink: 0; margin: 0; color: #374151; font-weight: 600; }
  .term dd { margin: 0; color: #4b5563; }
  .note-text {
    margin: 0;
    color: #374151;
    font-size: 10.5pt;
    line-height: 1.8;
    white-space: pre-wrap;
  }
  .article { margin-top: 6px; }
  .article h2 {
    margin: 22px 0 8px;
    color: #111827;
    font-size: 16pt;
    font-weight: 700;
    line-height: 1.4;
    break-after: avoid-page;
  }
  .article h3 {
    margin: 18px 0 6px;
    color: #1f2937;
    font-size: 13.5pt;
    font-weight: 600;
    line-height: 1.45;
    break-after: avoid-page;
  }
  .article h4 {
    margin: 14px 0 4px;
    color: #374151;
    font-size: 11.5pt;
    font-weight: 600;
    break-after: avoid-page;
  }
  .article p { margin: 0 0 10px; orphans: 3; widows: 3; }
  .article ul, .article ol { margin: 0 0 10px; padding-left: 20px; break-inside: avoid; }
  .article li { margin: 4px 0; }
  .article blockquote {
    margin: 12px 0;
    padding: 8px 14px;
    border-left: 3px solid #a78bfa;
    background: #f9f7ff;
    color: #4b5563;
  }
  .article pre {
    margin: 12px 0;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: #f3f4f6;
    font-size: 9pt;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    break-inside: avoid;
  }
  .article code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 0.9em; }
  .article p code, .article li code { padding: 1px 4px; border-radius: 3px; background: #f3f4f6; }
  .article hr { margin: 18px 0; border: 0; border-top: 1px solid #e5e7eb; }
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    color: #9ca3af;
    font-size: 8.5pt;
    line-height: 1.6;
    word-break: break-all;
  }
  .footer a { color: #7c3aed; }
  .notes-head { margin-bottom: 18px; }
  .note-entry {
    margin: 0 0 18px;
    padding: 12px 16px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fafafa;
    break-inside: avoid;
  }
  .note-entry h2 { margin: 0 0 4px; color: #111827; font-size: 13pt; line-height: 1.45; }
  .note-entry .meta { margin-bottom: 8px; }
  @page { size: A4; }
  @media print { a { border-bottom: 0; } }
`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function renderRuns(runs, fallback = '') {
  if (!Array.isArray(runs) || !runs.length) return escapeHtml(fallback);
  return runs
    .map((run) => {
      let out = escapeHtml(run?.text || '');
      if (run?.code) out = `<code>${out}</code>`;
      if (run?.bold) out = `<strong>${out}</strong>`;
      if (run?.italic) out = `<em>${out}</em>`;
      if (run?.href && isHttpUrl(run.href)) {
        out = `<a href="${escapeHtml(run.href)}">${out}</a>`;
      }
      return out;
    })
    .join('');
}

function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((block) => {
      switch (block?.type) {
        case 'heading': {
          const level = Math.min(4, Math.max(2, Number(block.level) || 2));
          return `<h${level}>${escapeHtml(block.text)}</h${level}>`;
        }
        case 'paragraph':
          return `<p>${renderRuns(block.runs, block.text)}</p>`;
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = Array.isArray(block.items) ? block.items : [];
          return `<${tag}>${items
            .map((item) => `<li>${renderRuns(item.runs, item.text)}</li>`)
            .join('')}</${tag}>`;
        }
        case 'quote':
          return `<blockquote>${renderRuns(block.runs, block.text)}</blockquote>`;
        case 'code':
          return `<pre>${escapeHtml(block.text || '')}</pre>`;
        case 'divider':
          return '<hr />';
        default:
          return block?.text ? `<p>${escapeHtml(block.text)}</p>` : '';
      }
    })
    .join('\n');
}

function renderSummary(summary) {
  if (!summary || !Array.isArray(summary.bullets) || !summary.bullets.length) return '';
  const keywords = Array.isArray(summary.keywords) ? summary.keywords : [];
  const meta = [
    summary.readMinutes ? `约 ${summary.readMinutes} 分钟` : '',
    summary.wordCount ? `${summary.wordCount} 字` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return `<section class="box summary">
    <h2>速读要点${meta ? `<span class="badge">${escapeHtml(meta)}</span>` : ''}</h2>
    <ul>${summary.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>
    ${
      keywords.length
        ? `<div class="keywords">${keywords
            .map((keyword) => `<span class="keyword">${escapeHtml(keyword)}</span>`)
            .join('')}</div>`
        : ''
    }
  </section>`;
}

function renderAi(ai, provider, model) {
  if (!ai) return '';
  const points = Array.isArray(ai.keyPoints) ? ai.keyPoints : [];
  const terms = Array.isArray(ai.terms) ? ai.terms : [];
  const questions = Array.isArray(ai.questions) ? ai.questions : [];
  if (!ai.tldr && !points.length && !ai.whyItMatters && !terms.length && !questions.length) {
    return '';
  }
  const badge = [provider, model, ai.level].filter(Boolean).join(' · ');
  return `<section class="box ai">
    <h2>AI 精读${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ''}</h2>
    ${ai.tldr ? `<p class="tldr">${escapeHtml(ai.tldr)}</p>` : ''}
    ${points.length ? `<h3>关键要点</h3><ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
    ${ai.whyItMatters ? `<h3>为什么值得关注</h3><p>${escapeHtml(ai.whyItMatters)}</p>` : ''}
    ${
      terms.length
        ? `<h3>术语卡</h3><dl>${terms
            .map(
              (term) =>
                `<div class="term"><dt>${escapeHtml(term.term)}</dt><dd>${escapeHtml(
                  term.note
                )}</dd></div>`
            )
            .join('')}</dl>`
        : ''
    }
    ${
      questions.length
        ? `<h3>带着这些问题继续学习</h3><ol>${questions
            .map((q) => `<li>${escapeHtml(q)}</li>`)
            .join('')}</ol>`
        : ''
    }
  </section>`;
}

function renderNote(note) {
  const text = String(note || '').trim();
  if (!text) return '';
  return `<section class="box note">
    <h2>我的学习笔记</h2>
    <p class="note-text">${escapeHtml(text)}</p>
  </section>`;
}

function pageShell(title, body, extraClass = '') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;" />
<title>${escapeHtml(title)}</title>
<style>${PDF_STYLES}</style>
</head>
<body class="${extraClass}">
${body}
</body>
</html>`;
}

function renderArticleHtml(payload = {}) {
  const title = String(payload.title || '前沿雷达文章').trim();
  const source = String(payload.source || payload.siteName || '').trim();
  const author = String(payload.author || '').trim();
  const date = formatDate(payload.publishedAt);
  const url = isHttpUrl(payload.url) ? payload.url : '';
  const metaParts = [date, author, source].filter(Boolean);
  const meta = metaParts
    .map((part) => escapeHtml(part))
    .join('<span class="sep">·</span>');

  const body = `<header>
      <div class="kicker">前沿雷达 · Frontier Radar${source ? ` · ${escapeHtml(source)}` : ''}</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">${meta}${
    url
      ? `${meta ? '<span class="sep">·</span>' : ''}<a href="${escapeHtml(
          url
        )}">${escapeHtml(url)}</a>`
      : ''
  }</div>
    </header>
    ${renderSummary(payload.summary)}
    ${renderAi(payload.ai, payload.aiProvider, payload.aiModel)}
    <section class="article">${renderBlocks(payload.blocks)}</section>
    ${renderNote(payload.note)}
    <footer class="footer">
      ${url ? `原文：<a href="${escapeHtml(url)}">${escapeHtml(url)}</a><br />` : ''}
      由前沿雷达 Frontier Radar 导出 · 内容版权归原作者及原站点所有
    </footer>`;
  return pageShell(title, body);
}

function renderNotesHtml(payload = {}) {
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const title = '前沿雷达 · 学习笔记';
  const body = `<header class="notes-head">
      <div class="kicker">前沿雷达 · Frontier Radar · Notebook</div>
      <h1>学习笔记</h1>
      <div class="meta">共 ${notes.length} 篇 · 导出于 ${escapeHtml(
    formatDate(new Date().toISOString())
  )}</div>
    </header>
    ${notes
      .map((note) => {
        const url = isHttpUrl(note.link) ? note.link : '';
        const meta = [
          note.source,
          formatDate(note.updatedAt),
        ]
          .filter(Boolean)
          .map((part) => escapeHtml(part))
          .join('<span class="sep">·</span>');
        return `<article class="note-entry">
          <h2>${escapeHtml(note.title || '未命名笔记')}</h2>
          <div class="meta">${meta}${
          url
            ? `${meta ? '<span class="sep">·</span>' : ''}<a href="${escapeHtml(url)}">原文链接</a>`
            : ''
        }</div>
          <p class="note-text">${escapeHtml(note.text || '')}</p>
        </article>`;
      })
      .join('\n')}
    <footer class="footer">由前沿雷达 Frontier Radar 导出 · 笔记仅保存在本机</footer>`;
  return pageShell(title, body);
}

async function printHtmlToPdf(html, outputPath) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'frontier-radar-pdf-'));
  const htmlPath = path.join(tmpDir, 'document.html');
  await fs.promises.writeFile(htmlPath, html, 'utf8');

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  try {
    await win.loadFile(htmlPath);
    await win.webContents
      .executeJavaScript('document.fonts.ready.then(() => true)')
      .catch(() => {});
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.62, bottom: 0.66, left: 0.7, right: 0.7 },
      preferCSSPageSize: false,
    });
    if (!pdf || !pdf.length) throw new Error('PDF 生成结果为空');
    await fs.promises.writeFile(outputPath, pdf);
    return { bytes: pdf.length };
  } finally {
    if (!win.isDestroyed()) win.destroy();
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function exportArticlePdf(payload, outputPath) {
  return printHtmlToPdf(renderArticleHtml(payload), outputPath);
}

async function exportNotesPdf(payload, outputPath) {
  return printHtmlToPdf(renderNotesHtml(payload), outputPath);
}

function sanitizeFilename(name, fallback = '前沿雷达') {
  const base = String(name || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 88);
  return `${base || fallback}.pdf`;
}

module.exports = {
  exportArticlePdf,
  exportNotesPdf,
  renderArticleHtml,
  renderNotesHtml,
  sanitizeFilename,
};

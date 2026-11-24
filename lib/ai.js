const Anthropic = require('@anthropic-ai/sdk');
const { fetchText } = require('./net');
const { readClaudeCodeConfig } = require('./local-claude');

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_INPUT_CHARS = 16000;

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  custom: '自定义接口',
  'local-claude': 'Claude Code 本机配置',
};

function getElectronFetch() {
  try {
    // Route the Anthropic SDK through Chromium's network stack so it uses
    // the same system / manual proxy as feed and article requests.
    // Under plain node (tests) this resolves to a path string and is ignored.
    // eslint-disable-next-line global-require
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.net?.fetch) {
      return (input, init) => electron.net.fetch(input, init);
    }
  } catch {
    // Fall back to the SDK's default fetch.
  }
  return null;
}

const SYSTEM_PROMPT = `你是一位严谨、务实的中文技术编辑，读者是有工程背景、希望快速理解前沿技术的学习者。
你只能依据用户提供的文章内容作答，不得补充文中没有的事实。
你的输出必须是合法 JSON，不要使用 Markdown 代码块，不要输出 JSON 以外的任何文字。`;

const NEWS_SYSTEM_PROMPT = `你是一位严谨、敏锐的中文科技新闻主编，读者是想用最短时间把握当天世界与科技重点的工程师。
你只能依据用户提供的新闻候选作答，不得补充候选列表之外的事实。
你的输出必须是合法 JSON，不要使用 Markdown 代码块，不要输出 JSON 以外的任何文字。`;

const MAX_NEWS_ITEMS = 40;

function buildPrompt(payload) {
  const content = String(payload.text || '')
    .replace(/\s+\n/g, '\n')
    .slice(0, MAX_INPUT_CHARS);
  return `请阅读下面的技术文章，并用简体中文输出一个 JSON 对象，字段如下：
{
  "tldr": "一句话总结核心内容（不超过 70 字）",
  "keyPoints": ["3-5 条关键要点，每条不超过 60 字"],
  "whyItMatters": "对开发者或学习者的意义（不超过 100 字）",
  "level": "入门 | 进阶 | 深入 三选一",
  "terms": [{"term": "术语原文", "note": "用一句大白话解释"}],
  "questions": ["2-3 个可以带着去验证或继续学习的问题"]
}

要求：
- keyPoints 覆盖文章的论点、方法、证据或结论，不要只是复述标题。
- terms 只收录真正可能构成阅读障碍的专业术语，最多 5 个。
- 如果文章信息不足，宁可少写，也不要编造。

文章标题：${payload.title || '（未知）'}
来源：${payload.source || '未知'}
正文：
${content}`;
}

function extractAnthropicText(response) {
  const parts = [];
  for (const block of response?.content || []) {
    if (block.type === 'text' && block.text) parts.push(block.text);
  }
  return parts.join('\n').trim();
}

function extractOpenAIText(json) {
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

function parseJson(text) {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    const data = JSON.parse(cleaned);
    if (!data || typeof data !== 'object') return null;
    const keyPoints = Array.isArray(data.keyPoints)
      ? data.keyPoints.map((p) => String(p)).filter(Boolean).slice(0, 6)
      : [];
    const terms = Array.isArray(data.terms)
      ? data.terms
          .filter((t) => t && t.term)
          .map((t) => ({ term: String(t.term), note: String(t.note || '') }))
          .slice(0, 6)
      : [];
    const questions = Array.isArray(data.questions)
      ? data.questions.map((q) => String(q)).filter(Boolean).slice(0, 4)
      : [];
    const level = ['入门', '进阶', '深入'].includes(data.level) ? data.level : '进阶';
    return {
      tldr: String(data.tldr || '').trim(),
      keyPoints,
      whyItMatters: String(data.whyItMatters || '').trim(),
      level,
      terms,
      questions,
    };
  } catch {
    return null;
  }
}

function buildNewsDigestPrompt(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items.slice(0, MAX_NEWS_ITEMS) : [];
  const lines = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index] || {};
    const id = String(item.id || `item-${index + 1}`).trim().slice(0, 80);
    const source = String(item.source || '未知来源')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
    const title = String(item.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);
    const summary = String(item.summary || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    const coverage = Number(item.coverage) > 1 ? ` · ${Number(item.coverage)} 家媒体报道` : '';
    const heat = Number(item.heat) > 0 ? ` · 热度 ${Number(item.heat)}` : '';
    lines.push(`[${id}] ${source}${coverage}${heat} | ${title} | ${summary}`);
  }
  let list = lines.join('\n');
  if (list.length > MAX_INPUT_CHARS) list = list.slice(0, MAX_INPUT_CHARS);

  return `请综合下面的新闻候选，用简体中文整理一份今日重点概览，输出 JSON 对象：
{
  "headline": "今天最重要的一件事（不超过 50 字）",
  "overview": "2-3 句话的今日整体概览（不超过 180 字）",
  "highlights": [
    {
      "itemId": "候选列表中的 ID",
      "title": "重点信息标题（不超过 40 字）",
      "summary": "发生了什么、关键信息（不超过 90 字）",
      "whyItMatters": "为什么值得关注（不超过 70 字）",
      "source": "主要来源名称"
    }
  ],
  "themes": ["3-5 个今日主题或趋势"],
  "watch": ["2-3 个接下来值得留意的点"]
}

要求：
- 选择 3-6 条最重要的信息，优先多家媒体报道、影响大的科技事件；世界要闻只在确实重要时入选。
- 不得编造候选列表之外的事实；标题、来源尽量沿用候选内容。
- itemId 只能使用候选列表中真实存在的 ID；不确定时省略该字段。
- 只输出 JSON，不要输出 JSON 以外的文字。

日期：${payload.date || '今天'}
范围：${payload.scopeLabel || '今日'}
候选新闻：
${list}`;
}

function parseNewsDigestJson(text) {
  if (!text) return null;
  let cleaned = String(text).trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    const data = JSON.parse(cleaned);
    if (!data || typeof data !== 'object') return null;
    const highlights = Array.isArray(data.highlights)
      ? data.highlights
          .filter((item) => item && (item.title || item.summary))
          .map((item) => ({
            itemId: item.itemId != null ? String(item.itemId).trim().slice(0, 80) : '',
            title: String(item.title || '').trim().slice(0, 120),
            summary: String(item.summary || '').trim().slice(0, 300),
            whyItMatters: String(item.whyItMatters || '').trim().slice(0, 200),
            source: String(item.source || '').trim().slice(0, 60),
          }))
          .slice(0, 6)
      : [];
    const themes = Array.isArray(data.themes)
      ? data.themes.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
      : [];
    const watch = Array.isArray(data.watch)
      ? data.watch.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : [];
    const headline = String(data.headline || '').trim().slice(0, 200);
    const overview = String(data.overview || '').trim().slice(0, 800);
    if (!headline && !overview && !highlights.length) return null;
    return { headline, overview, highlights, themes, watch };
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value) {
  let raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) {
    raw = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(raw) ? `http://${raw}` : `https://${raw}`;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return raw.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function chatCompletionsUrl(baseURL) {
  const base = String(baseURL || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  if (/\/v\d+(?:\.\d+)?$/i.test(base)) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function isOfficialAnthropic(baseURL) {
  if (!baseURL) return true;
  try {
    return /(^|\.)api\.anthropic\.com$/i.test(new URL(baseURL).hostname);
  } catch {
    return false;
  }
}

function resolveProvider(config = {}) {
  const provider = ['anthropic', 'deepseek', 'custom', 'local-claude'].includes(
    config.aiProvider
  )
    ? config.aiProvider
    : 'local-claude';

  if (provider === 'local-claude') {
    const local = readClaudeCodeConfig();
    if (!local.ok) {
      return {
        error: {
          code: 'local_config_missing',
          message: local.error || '无法从本机 Claude Code 配置中读取 API 凭据',
        },
      };
    }
    return {
      provider,
      providerLabel: PROVIDER_LABELS[provider],
      kind: 'anthropic',
      baseURL: local.baseUrl || '',
      model: local.model || DEFAULT_ANTHROPIC_MODEL,
      authToken: local.authToken || '',
      apiKey: local.apiKey || '',
      official: isOfficialAnthropic(local.baseUrl),
    };
  }

  if (provider === 'deepseek') {
    if (!config.apiKey) {
      return {
        error: {
          code: 'no_key',
          message: '尚未配置 DeepSeek API Key',
        },
      };
    }
    return {
      provider,
      providerLabel: PROVIDER_LABELS[provider],
      kind: 'openai',
      baseURL: normalizeBaseUrl(config.aiBaseUrl) || 'https://api.deepseek.com/v1',
      model: String(config.aiModel || '').trim() || DEFAULT_DEEPSEEK_MODEL,
      apiKey: config.apiKey,
    };
  }

  if (provider === 'custom') {
    const baseURL = normalizeBaseUrl(config.aiBaseUrl);
    if (!baseURL) {
      return {
        error: {
          code: 'no_base_url',
          message: '尚未填写自定义接口地址（例如 http://127.0.0.1:11434/v1）',
        },
      };
    }
    return {
      provider,
      providerLabel: PROVIDER_LABELS[provider],
      kind: 'openai',
      baseURL,
      model: String(config.aiModel || '').trim() || 'local-model',
      apiKey: config.apiKey || '',
    };
  }

  if (!config.apiKey) {
    return {
      error: {
        code: 'no_key',
        message: '尚未配置 Anthropic API Key',
      },
    };
  }
  return {
    provider: 'anthropic',
    providerLabel: PROVIDER_LABELS.anthropic,
    kind: 'anthropic',
    baseURL: '',
    model: String(config.aiModel || '').trim() || DEFAULT_ANTHROPIC_MODEL,
    apiKey: config.apiKey,
    authToken: '',
    official: true,
  };
}

async function callAnthropic(provider, prompt, systemPrompt = SYSTEM_PROMPT) {
  const electronFetch = getElectronFetch();
  const credentials = provider.authToken
    ? { authToken: provider.authToken }
    : { apiKey: provider.apiKey };
  const client = new Anthropic({
    ...credentials,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
    maxRetries: 2,
    timeout: 120000,
    ...(electronFetch ? { fetch: electronFetch } : {}),
  });
  const params = {
    model: provider.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  };

  let response;
  if (provider.official) {
    try {
      response = await client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
    } catch (err) {
      const message = String(err?.message || '');
      if (/fallback|beta|unsupported|unknown parameter/i.test(message)) {
        response = await client.messages.create(params);
      } else {
        throw err;
      }
    }
  } else {
    response = await client.messages.create(params);
  }

  if (response.stop_reason === 'refusal') {
    return {
      refused: true,
      text: '',
      usage: response.usage
        ? {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        : null,
    };
  }

  return {
    refused: false,
    text: extractAnthropicText(response),
    usage: response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : null,
  };
}

async function callOpenAICompatible(provider, prompt, systemPrompt = SYSTEM_PROMPT) {
  const url = chatCompletionsUrl(provider.baseURL);
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const body = JSON.stringify({
    model: provider.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: 4096,
    temperature: 0.2,
    stream: false,
  });

  const res = await fetchText(url, {
    method: 'POST',
    body,
    headers,
    accept: 'application/json',
    timeout: 120000,
    retries: 1,
  });
  let json;
  try {
    json = JSON.parse(res.text);
  } catch {
    return {
      refused: false,
      text: '',
      usage: null,
      invalidJson: true,
      raw: String(res.text || '').slice(0, 2000),
    };
  }

  return {
    refused: false,
    text: extractOpenAIText(json),
    usage: json?.usage
      ? {
          inputTokens: json.usage.prompt_tokens,
          outputTokens: json.usage.completion_tokens,
        }
      : null,
  };
}

async function requestStructured(provider, prompt, systemPrompt) {
  let result;
  try {
    result =
      provider.kind === 'anthropic'
        ? await callAnthropic(provider, prompt, systemPrompt)
        : await callOpenAICompatible(provider, prompt, systemPrompt);
  } catch (err) {
    const status = err?.status ? `（HTTP ${err.status}）` : '';
    return {
      error: {
        code: 'api_error',
        message: `${err?.message || '调用 AI 服务失败'}${status}`,
      },
    };
  }

  if (result.refused) {
    return {
      error: {
        code: 'refusal',
        message: '模型基于安全策略拒绝了这次请求，请稍后重试。',
      },
    };
  }
  if (result.invalidJson) {
    return {
      error: {
        code: 'api_error',
        message: 'AI 服务返回了非 JSON 响应，请检查接口地址是否为 OpenAI 兼容接口。',
        raw: result.raw,
      },
    };
  }
  return { result };
}

function createSummarizer(getConfig) {
  async function summarize(payload) {
    if (!payload || !payload.text || payload.text.trim().length < 80) {
      return { ok: false, code: 'no_content', message: '正文内容不足，无法生成精读摘要' };
    }

    const config = (typeof getConfig === 'function' ? getConfig() : null) || {};
    const provider = resolveProvider(config);
    if (provider.error) {
      return { ok: false, ...provider.error };
    }

    const prompt = buildPrompt(payload);
    let result;
    try {
      result =
        provider.kind === 'anthropic'
          ? await callAnthropic(provider, prompt)
          : await callOpenAICompatible(provider, prompt);
    } catch (err) {
      const status = err?.status ? `（HTTP ${err.status}）` : '';
      return {
        ok: false,
        code: 'api_error',
        message: `${err?.message || '调用 AI 服务失败'}${status}`,
      };
    }

    if (result.refused) {
      return {
        ok: false,
        code: 'refusal',
        message: '模型基于安全策略拒绝了这次请求，请尝试其他文章。',
      };
    }
    if (result.invalidJson) {
      return {
        ok: false,
        code: 'api_error',
        message: 'AI 服务返回了非 JSON 响应，请检查接口地址是否为 OpenAI 兼容接口。',
        raw: result.raw,
      };
    }

    const data = parseJson(result.text);
    if (!data) {
      return {
        ok: false,
        code: 'parse_error',
        message: '模型返回的内容无法解析为精读 JSON，请重试或换一个模型。',
        raw: String(result.text || '').slice(0, 4000),
      };
    }

    return {
      ok: true,
      provider: provider.provider,
      providerLabel: provider.providerLabel,
      model: provider.model,
      data,
      usage: result.usage || null,
      generatedAt: new Date().toISOString(),
    };
  }

  async function summarizeNewsDigest(payload = {}) {
    const items = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
    if (!items.length) {
      return { ok: false, code: 'no_content', message: '没有可整理的新闻' };
    }

    const config = (typeof getConfig === 'function' ? getConfig() : null) || {};
    const provider = resolveProvider(config);
    if (provider.error) {
      return { ok: false, ...provider.error };
    }

    const prompt = buildNewsDigestPrompt({
      ...payload,
      items: items.slice(0, MAX_NEWS_ITEMS),
    });

    let result = null;
    let data = null;
    for (let attempt = 0; attempt < 2 && !data; attempt += 1) {
      const response = await requestStructured(provider, prompt, NEWS_SYSTEM_PROMPT);
      if (response.error) return { ok: false, ...response.error };
      result = response.result;
      data = parseNewsDigestJson(result.text);
    }

    if (!data) {
      console.error('[news-digest] AI returned unparseable JSON after retry');
      return {
        ok: false,
        code: 'parse_error',
        message: '模型返回的内容无法解析为概览 JSON，请重试或换一个模型。',
        raw: String(result?.text || '').slice(0, 4000),
      };
    }

    return {
      ok: true,
      provider: provider.provider,
      providerLabel: provider.providerLabel,
      model: provider.model,
      data,
      usage: result.usage || null,
      generatedAt: new Date().toISOString(),
    };
  }

  return { summarize, summarizeNewsDigest, resolveProvider };
}

module.exports = { createSummarizer, resolveProvider, DEFAULT_ANTHROPIC_MODEL };

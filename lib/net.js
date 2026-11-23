const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 FrontierRadar/1.0';

let cachedProxyFetch = null;
let cachedDirectFetch = null;
let directSession = null;

/** Set by the main process after app ready, using a session configured direct. */
function setDirectSession(ses) {
  directSession = ses || null;
  cachedDirectFetch = null;
}

/**
 * Prefer Electron's Chromium network stack in the main process so that
 * Windows / macOS system proxy settings (Clash, Surge, PAC, …) are honored.
 * Routes marked `direct` use a separate direct-only session.
 * Plain `node` scripts (tests) fall back to Node's global fetch.
 */
function getFetch(route = 'proxy') {
  const wantDirect = route === 'direct';
  if (wantDirect && cachedDirectFetch) return cachedDirectFetch;
  if (!wantDirect && cachedProxyFetch) return cachedProxyFetch;

  try {
    // In Electron this is the module; under plain node it is a path string.
    // eslint-disable-next-line global-require
    const electron = require('electron');
    if (electron && typeof electron === 'object' && electron.net?.fetch) {
      if (wantDirect) {
        if (directSession && typeof directSession.fetch === 'function') {
          cachedDirectFetch = (input, init) => directSession.fetch(input, init);
          return cachedDirectFetch;
        }
        // Session not wired yet: do not cache this fallback.
        return (input, init) => electron.net.fetch(input, init);
      }
      cachedProxyFetch = (input, init) => electron.net.fetch(input, init);
      return cachedProxyFetch;
    }
  } catch {
    // Fall back below.
  }

  if (wantDirect) {
    return (input, init) => globalThis.fetch(input, init);
  }
  cachedProxyFetch = (input, init) => globalThis.fetch(input, init);
  return cachedProxyFetch;
}

const AUTO_DIRECT_PROBE_MS = 1200;
const DIRECT_PROBE_TTL = 5 * 60 * 1000;
const directProbeCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return String(url);
  }
}

function getProbeState(host) {
  const entry = directProbeCache.get(host);
  if (!entry) return null;
  if (Date.now() - entry.at > DIRECT_PROBE_TTL) {
    directProbeCache.delete(host);
    return null;
  }
  return entry.reachable;
}

function setProbeState(host, reachable) {
  directProbeCache.set(host, { reachable, at: Date.now() });
}

/**
 * Fast HEAD probe on the direct route. Any normal response (including 405)
 * means the host is reachable without the proxy.
 */
async function probeDirect(url, timeout, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(400, timeout));
  try {
    const doFetch = getFetch('direct');
    const res = await doFetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept: '*/*',
        ...headers,
      },
    });
    return res.status < 400 || res.status === 405;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  if (err.status && (err.status >= 500 || err.status === 429 || err.status === 408)) return true;
  return /fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ENETUNREACH|network/i.test(
    String(err.message || '')
  );
}

/**
 * Fetch text with a hard per-attempt timeout, browser-ish headers and
 * a small retry budget for transient network / 5xx failures.
 * Returns { text, status, etag, lastModified, url }.
 */
async function fetchText(url, options = {}) {
  const {
    timeout = 15000,
    headers = {},
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    retries = 1,
    method = 'GET',
    body,
    route = 'proxy',
  } = options;

  if (route === 'auto') {
    const host = hostOf(url);
    let reachable = getProbeState(host);
    if (reachable === null) {
      reachable = await probeDirect(url, Math.min(AUTO_DIRECT_PROBE_MS, timeout), headers);
      setProbeState(host, reachable);
    }
    if (reachable) {
      try {
        const result = await fetchText(url, { ...options, route: 'direct' });
        return { ...result, usedRoute: 'direct' };
      } catch {
        setProbeState(host, false);
      }
    }
    const result = await fetchText(url, { ...options, route: 'proxy' });
    return { ...result, usedRoute: 'proxy' };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const doFetch = getFetch(route);
      const init = {
        method,
        redirect: 'follow',
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_UA,
          Accept: accept,
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...headers,
        },
      };
      if (body !== undefined) init.body = body;
      const res = await doFetch(url, init);

      if (res.status === 304) {
        return {
          notModified: true,
          status: 304,
          etag: res.headers.get('etag') || '',
          lastModified: res.headers.get('last-modified') || '',
          url: res.url || url,
          text: '',
          usedRoute: route,
        };
      }

      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        const detail = bodyText ? ` — ${bodyText.slice(0, 320)}` : '';
        const error = new Error(`HTTP ${res.status} ${res.statusText || ''}${detail}`.trim());
        error.status = res.status;
        throw error;
      }

      const text = await res.text();
      return {
        text,
        status: res.status,
        etag: res.headers.get('etag') || '',
        lastModified: res.headers.get('last-modified') || '',
        url: res.url || url,
        contentType: res.headers.get('content-type') || '',
        usedRoute: route,
      };
    } catch (err) {
      const error =
        err && err.name === 'AbortError' ? Object.assign(new Error('请求超时'), { name: 'AbortError' }) : err;
      lastError = error;
      if (attempt < retries && isRetryableNetworkError(error)) {
        await sleep(500 * attempt);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('请求失败');
}

function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  fetchText,
  isHttpUrl,
  DEFAULT_UA,
  isRetryableNetworkError,
  setDirectSession,
  AUTO_DIRECT_PROBE_MS,
};

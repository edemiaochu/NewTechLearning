const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  nativeTheme,
  Menu,
  screen,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { FeedService } = require('./lib/feeds');
const { loadArticle } = require('./lib/article');
const { ArticleStore } = require('./lib/article-store');
const { getSource } = require('./lib/sources');
const { SettingsStore } = require('./lib/settings');
const { createSummarizer } = require('./lib/ai');
const { inspectClaudeCodeConfig } = require('./lib/local-claude');
const { isHttpUrl, DEFAULT_UA, setDirectSession, fetchText } = require('./lib/net');
const {
  exportArticlePdf,
  exportNotesPdf,
  exportNewsDigestPdf,
  sanitizeFilename,
} = require('./lib/pdf');

app.setName('前沿雷达');
app.setAppUserModelId('com.luokun.frontier-radar');
if (process.env.FR_USER_DATA) {
  app.setPath('userData', process.env.FR_USER_DATA);
}

const isDev = process.argv.includes('--dev');
const isScreenshot = process.argv.includes('--screenshot');
const shotView = (process.argv.find((arg) => arg.startsWith('--shot-view=')) || '').split('=')[1] || '';

let win = null;
let feeds = null;
let articleStore = null;
let settings = null;
let summarizer = null;
let proxyStatus = { mode: 'system', rules: '', resolved: '', error: '' };

const THEME_BG = {
  aurora: '#191b23',
  ocean: '#0f1822',
  forest: '#101a14',
  ember: '#1a1210',
  violet: '#1b1423',
  light: '#f3f4f6',
};

function normalizeProxyUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const u = new URL(withScheme);
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(u.protocol.toLowerCase())) return null;
    if (!u.hostname) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Apply the proxy to the default session. `net.fetch` in the main process
 * uses this session, so this covers feed/article requests and the renderer.
 */
async function applyProxyConfig(config = {}) {
  const ses = session.defaultSession;
  const requestedMode = ['system', 'direct', 'manual'].includes(config.mode)
    ? config.mode
    : 'system';
  let result = { requestedMode, mode: requestedMode, rules: '', error: '' };

  try {
    if (requestedMode === 'manual') {
      const u = normalizeProxyUrl(config.url);
      if (!u) {
        await ses.setProxy({ mode: 'system' });
        result = {
          requestedMode,
          mode: 'system',
          rules: 'system',
          error: '手动代理地址无效，已临时回退到系统代理',
        };
      } else {
        const scheme = u.protocol.replace(':', '').toLowerCase();
        const hostPort = u.port ? `${u.hostname}:${u.port}` : u.hostname;
        const proxyRules =
          scheme === 'socks4' || scheme === 'socks5'
            ? `${scheme}://${hostPort}`
            : `http=${hostPort};https=${hostPort}`;
        await ses.setProxy({
          mode: 'fixed_servers',
          proxyRules,
          proxyBypassRules: '<local>',
        });
        result = { requestedMode, mode: 'manual', rules: proxyRules, error: '' };
      }
    } else if (requestedMode === 'direct') {
      await ses.setProxy({ mode: 'direct' });
      result = { requestedMode, mode: 'direct', rules: 'direct', error: '' };
    } else {
      await ses.setProxy({ mode: 'system' });
      result = { requestedMode, mode: 'system', rules: 'system', error: '' };
    }
    ses.closeAllConnections?.();
  } catch (err) {
    result.error = err?.message || '代理设置失败';
    try {
      await ses.setProxy({ mode: 'system' });
      result.mode = 'system';
      result.rules = 'system';
    } catch {
      // Ignore.
    }
  }

  try {
    result.resolved = await ses.resolveProxy('https://claude.dev/');
  } catch {
    result.resolved = '';
  }

  proxyStatus = result;
  return result;
}

async function testNetwork() {
  const started = Date.now();
  const requestedRoute = sourceRoute('claude');
  try {
    const res = await fetchText('https://claude.dev/rss.xml', {
      timeout: 12000,
      retries: 1,
      route: requestedRoute,
      accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    });
    const usedRoute = res.usedRoute === 'direct' ? 'direct' : 'proxy';
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      ms: Date.now() - started,
      route: usedRoute,
      mode: usedRoute === 'direct' ? 'direct' : proxyStatus.mode,
      rules: usedRoute === 'direct' ? 'direct' : proxyStatus.rules,
    };
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: err?.name === 'AbortError' ? '连接超时（12 秒）' : err?.message || '连接失败',
      route: requestedRoute === 'direct' ? 'direct' : 'auto',
      mode: requestedRoute === 'direct' ? 'direct' : proxyStatus.mode,
      rules: requestedRoute === 'direct' ? 'direct' : proxyStatus.rules,
    };
  }
}

function sourceRoute(sourceId) {
  if (settings?.getProxyConfig().mode === 'direct') return 'direct';
  if (proxyStatus?.resolved === 'DIRECT') return 'direct';
  return settings?.getDirectSources().includes(sourceId) ? 'direct' : 'auto';
}

function defaultPdfDir() {
  try {
    return app.getPath('documents');
  } catch {
    try {
      return app.getPath('home');
    } catch {
      return process.cwd();
    }
  }
}

function createWindow() {
  const backgroundColor = THEME_BG.aurora;
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1480, Math.max(1040, workArea.width - 80)),
    height: Math.min(940, Math.max(680, workArea.height - 80)),
    minWidth: 1040,
    minHeight: 680,
    center: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    // macOS keeps its native traffic lights; centre them in the 58px bar.
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 18, y: 21 } }
      : {}),
    backgroundColor,
    roundedCorners: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (process.platform === 'darwin') {
    try {
      win.setWindowButtonPosition?.({ x: 18, y: 21 });
    } catch {
      // Older macOS/Electron builds: keep the default traffic-light position.
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (isHttpUrl(url)) shell.openExternal(url);
    }
  });

  win.on('maximize', () => win?.webContents.send('window:maximized-changed', true));
  win.on('unmaximize', () => win?.webContents.send('window:maximized-changed', false));

  const loadOptions = shotView ? { hash: shotView } : undefined;
  win.loadFile(path.join(__dirname, 'src', 'index.html'), loadOptions);

  win.once('ready-to-show', () => {
    win.show();
    if (isDev) win.webContents.openDevTools({ mode: 'detach' });
  });

  if (isScreenshot) {
    win.webContents.once('did-finish-load', () => {
      const delay = Number(process.env.FR_SHOT_DELAY || 9000);
      if (process.argv.includes('--shot-reader')) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('.feed-card')?.click()")
            .catch(() => {});
        }, 1600);
      }
      if (process.argv.includes('--shot-settings')) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('#settings-btn')?.click()")
            .catch(() => {});
        }, 1200);
      }
      if (process.argv.includes('--shot-theme')) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('#theme-btn')?.click()")
            .catch(() => {});
        }, 1200);
      }
      if (process.argv.includes('--shot-light')) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('#theme-btn')?.click()")
            .catch(() => {});
        }, 1200);
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('[data-theme-option=\"light\"]')?.click()")
            .catch(() => {});
        }, 2000);
      }
      if (process.env.FR_SHOT_JS) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript(process.env.FR_SHOT_JS)
            .then((value) => {
              if (value !== undefined) console.log('[screenshot] js result:', JSON.stringify(value));
            })
            .catch((err) => console.error('[screenshot] js failed:', err.message));
        }, Number(process.env.FR_SHOT_JS_DELAY || 1500));
      }
      if (process.argv.includes('--shot-notes')) {
        setTimeout(() => {
          win.webContents
            .executeJavaScript("document.querySelector('.feed-card')?.click()")
            .catch(() => {});
        }, 1400);
        setTimeout(() => {
          win.webContents
            .executeJavaScript(`(() => {
              const t = document.getElementById('note-input');
              if (!t) return;
              t.value = '测试笔记：把“验证”当作一等公民，先定义可观察的证据，再让智能体自动迭代。';
              t.dispatchEvent(new Event('input', { bubbles: true }));
            })()`)
            .catch(() => {});
        }, 4200);
        setTimeout(() => {
          win.webContents
            .executeJavaScript(`(() => {
              document.querySelector('.reader-head [data-action="close-reader"]')?.click();
              document.querySelector('[data-nav="notes"]')?.click();
            })()`)
            .catch(() => {});
        }, 5600);
      }
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          const out = path.join(process.cwd(), `screenshot${shotView ? `-${shotView}` : ''}.png`);
          fs.writeFileSync(out, image.toPNG());
          console.log(`[screenshot] saved ${out}`);
        } catch (err) {
          console.error('[screenshot] failed:', err);
        } finally {
          app.quit();
        }
      }, delay);
    });
  }
}

function registerIpc() {
  ipcMain.handle('feeds:sources', () => feeds.getSourceMeta());
  ipcMain.handle('feeds:load', () => feeds.snapshot());
  ipcMain.handle('feeds:refresh', async (_event, options = {}) => {
    if (options.sourceId) {
      const result = await feeds.refreshSource(options.sourceId, { force: !!options.force });
      if (!result.error) feeds.cache.updatedAt = new Date().toISOString();
      await feeds.save();
      return { ...feeds.snapshot(), report: { succeeded: result.error ? 0 : 1, total: 1, errors: result.error ? [result] : [] } };
    }
    return feeds.refreshAll({ force: !!options.force });
  });
  ipcMain.handle('feeds:clear', async () => {
    await articleStore.clear();
    return feeds.clear();
  });

  ipcMain.handle('article:load', async (_event, item) => {
    if (!item || !item.link || !isHttpUrl(item.link)) {
      return { ok: false, message: '无效的文章链接' };
    }
    const source = getSource(item.sourceId);
    const route = sourceRoute(item.sourceId);
    const started = Date.now();
    try {
      const article = await articleStore.load(item, (target) =>
        loadArticle(target, { route })
      );
      if (isDev || isScreenshot) {
        console.log(
          `[article] ${Date.now() - started}ms ${article.fromCache ? 'cache ' : ''}${route} ${
            item.link
          }`
        );
      }
      return { ...article, sourceName: source?.name || '', sourceTitle: source?.title || '' };
    } catch (err) {
      if (isDev || isScreenshot) {
        console.log(`[article] failed ${Date.now() - started}ms ${item.link}: ${err.message}`);
      }
      return {
        ok: false,
        message: err?.message || '正文抓取失败',
        id: item.id,
        url: item.link,
        title: item.title,
        sourceName: source?.name || '',
        sourceTitle: source?.title || '',
      };
    }
  });

  ipcMain.handle('ai:summarize', async (_event, payload) => {
    try {
      return await summarizer.summarize(payload);
    } catch (err) {
      return { ok: false, code: 'unexpected', message: err?.message || '生成失败' };
    }
  });

  ipcMain.handle('news:digest', async (_event, payload) => {
    try {
      return await summarizer.summarizeNewsDigest(payload);
    } catch (err) {
      return { ok: false, code: 'unexpected', message: err?.message || '生成失败' };
    }
  });

  const settingsSnapshot = (state = settings.publicState()) => ({
    ...state,
    proxyStatus,
    localConfig: inspectClaudeCodeConfig(),
  });

  ipcMain.handle('settings:get', () => settingsSnapshot());
  ipcMain.handle('settings:set', async (_event, patch = {}) => {
    if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')) {
      const state = await settings.setApiKey(patch.apiKey);
      return settingsSnapshot(state);
    }
    const state = settings.update(patch);
    if (
      Object.prototype.hasOwnProperty.call(patch, 'proxyMode') ||
      Object.prototype.hasOwnProperty.call(patch, 'proxyUrl')
    ) {
      proxyStatus = await applyProxyConfig(settings.getProxyConfig());
    }
    return settingsSnapshot(state);
  });

  ipcMain.handle('net:test', () => testNetwork());

  ipcMain.handle('pdf:export-article', async (_event, payload = {}) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出文章 PDF',
        defaultPath: path.join(
          defaultPdfDir(),
          sanitizeFilename(payload?.title || '前沿雷达文章')
        ),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { saved: false };
      await exportArticlePdf(payload, filePath);
      return { saved: true, path: filePath };
    } catch (err) {
      return { saved: false, error: err?.message || 'PDF 导出失败' };
    }
  });

  ipcMain.handle('pdf:export-notes', async (_event, payload = {}) => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出学习笔记 PDF',
        defaultPath: path.join(
          defaultPdfDir(),
          sanitizeFilename(`前沿雷达-学习笔记-${stamp}`)
        ),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { saved: false };
      await exportNotesPdf(payload, filePath);
      return { saved: true, path: filePath };
    } catch (err) {
      return { saved: false, error: err?.message || 'PDF 导出失败' };
    }
  });

  ipcMain.handle('notes:export', async (_event, markdown) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win, {
      title: '导出学习笔记',
      defaultPath: `前沿雷达-学习笔记-${stamp}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    try {
      await fs.promises.writeFile(result.filePath, String(markdown || ''), 'utf8');
      return { saved: true, path: result.filePath };
    } catch (err) {
      return { saved: false, error: err.message };
    }
  });

  ipcMain.handle('news:export-digest', async (_event, markdown) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const result = await dialog.showSaveDialog(win, {
      title: '导出 AI 今日概览',
      defaultPath: path.join(defaultPdfDir(), `前沿雷达-AI今日概览-${stamp}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    try {
      await fs.promises.writeFile(result.filePath, String(markdown || ''), 'utf8');
      return { saved: true, path: result.filePath };
    } catch (err) {
      return { saved: false, error: err.message };
    }
  });

  ipcMain.handle('pdf:export-news-digest', async (_event, payload = {}) => {
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: '导出 AI 今日概览 PDF',
        defaultPath: path.join(
          defaultPdfDir(),
          sanitizeFilename(`前沿雷达-AI今日概览-${stamp}`)
        ),
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (canceled || !filePath) return { saved: false };
      await exportNewsDigestPdf(payload, filePath);
      return { saved: true, path: filePath };
    } catch (err) {
      return { saved: false, error: err?.message || 'PDF 导出失败' };
    }
  });

  ipcMain.handle('shell:open', async (_event, url) => {
    if (!isHttpUrl(url)) return { ok: false };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataPath: app.getPath('userData'),
  }));

  ipcMain.handle('theme:set', (_event, theme) => {
    const key = Object.prototype.hasOwnProperty.call(THEME_BG, theme) ? theme : 'aurora';
    nativeTheme.themeSource = key === 'light' ? 'light' : 'dark';
    try {
      win.setBackgroundColor(THEME_BG[key]);
    } catch {
      // Ignore.
    }
    return { ok: true };
  });

  ipcMain.handle('window:minimize', () => win?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });
  ipcMain.handle('window:close', () => win?.close());
  ipcMain.handle('window:is-maximized', () => !!win?.isMaximized());
}

async function bootstrap() {
  Menu.setApplicationMenu(null);

  const userData = app.getPath('userData');
  settings = new SettingsStore(path.join(userData, 'settings.json'));
  await settings.load();

  feeds = new FeedService({
    cacheFile: path.join(userData, 'feed-cache.json'),
    routeForSource: (sourceId) => sourceRoute(sourceId),
  });
  await feeds.init();
  articleStore = new ArticleStore({ file: path.join(userData, 'article-cache.json') });
  await articleStore.init();

  proxyStatus = await applyProxyConfig(settings.getProxyConfig());

  try {
    const directSession = session.fromPartition('persist:frontier-direct');
    await directSession.setProxy({ mode: 'direct' });
    setDirectSession(directSession);
  } catch (err) {
    console.error('[net] failed to initialize direct session:', err.message);
  }

  summarizer = createSummarizer(() => settings.getAiConfig());

  if (isScreenshot) {
    const snap = feeds.snapshot();
    const hasItems = Object.values(snap.sources).some((s) => s.items.length);
    if (!hasItems || snap.stale || process.env.FR_SHOT_REFRESH === '1') {
      await feeds.refreshAll({ force: true });
    }
  } else {
    const snap = feeds.snapshot();
    if (snap.stale) {
      feeds.refreshAll().catch((err) => console.error('[feeds] background refresh failed:', err.message));
    }
  }

  registerIpc();
  createWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error('Failed to start:', err);
    dialog.showErrorBox('前沿雷达启动失败', String(err?.stack || err));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

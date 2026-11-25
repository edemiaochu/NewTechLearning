(function () {
  var allowed = ['aurora', 'ocean', 'forest', 'ember', 'violet', 'black', 'graphite', 'light'];
  var theme = null;
  var glassAlpha = 100;
  var themeGray = null;
  try {
    theme = localStorage.getItem('fr.theme');
    var rawAlpha = localStorage.getItem('fr.glassAlpha');
    glassAlpha = rawAlpha == null || rawAlpha === '' ? 100 : Number(rawAlpha);
    themeGray = JSON.parse(localStorage.getItem('fr.themeGray') || 'null');
  } catch (e) {}
  if (allowed.indexOf(theme) === -1) theme = 'aurora';
  document.documentElement.dataset.theme = theme;

  // Theme controls are written before first paint so switching themes never
  // flashes the full-strength glass or the default grayscale value.
  if (!Number.isFinite(glassAlpha) || glassAlpha < 0 || glassAlpha > 100) glassAlpha = 100;
  document.documentElement.style.setProperty('--glass-alpha', String(glassAlpha / 100));
  if (themeGray && typeof themeGray === 'object') {
    var gray = Number(themeGray[theme]);
    if (Number.isFinite(gray)) {
      gray = Math.min(20, Math.max(0, gray));
      document.documentElement.style.setProperty('--theme-gray', String(gray));
    }
  }

  // Platform class is set before first paint so macOS gets native traffic
  // lights (no custom window buttons) without a layout flash.
  var platform = '';
  try {
    platform = (window.radar && window.radar.platform) || '';
  } catch (e) {}
  if (!platform) {
    var uaPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || '';
    var navPlatform = navigator.platform || uaPlatform;
    platform = /mac/i.test(navPlatform) ? 'darwin' : /win/i.test(navPlatform) ? 'win32' : 'linux';
  }
  document.documentElement.dataset.platform = platform;
})();

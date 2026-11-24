(function () {
  var allowed = ['aurora', 'ocean', 'forest', 'ember', 'violet', 'light'];
  var theme = null;
  try {
    theme = localStorage.getItem('fr.theme');
  } catch (e) {}
  if (allowed.indexOf(theme) === -1) theme = 'aurora';
  document.documentElement.dataset.theme = theme;

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

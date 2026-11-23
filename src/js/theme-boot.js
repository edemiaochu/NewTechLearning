(function () {
  var allowed = ['aurora', 'ocean', 'forest', 'ember', 'violet', 'light'];
  var theme = null;
  try {
    theme = localStorage.getItem('fr.theme');
  } catch (e) {}
  if (allowed.indexOf(theme) === -1) theme = 'aurora';
  document.documentElement.dataset.theme = theme;
})();

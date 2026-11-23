const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radar', {
  sources: () => ipcRenderer.invoke('feeds:sources'),
  loadFeeds: () => ipcRenderer.invoke('feeds:load'),
  refreshFeeds: (options) => ipcRenderer.invoke('feeds:refresh', options || {}),
  clearFeeds: () => ipcRenderer.invoke('feeds:clear'),
  loadArticle: (item) => ipcRenderer.invoke('article:load', item),
  summarizeAI: (payload) => ipcRenderer.invoke('ai:summarize', payload),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testNetwork: () => ipcRenderer.invoke('net:test'),
  exportNotes: (markdown) => ipcRenderer.invoke('notes:export', markdown),
  exportArticlePdf: (payload) => ipcRenderer.invoke('pdf:export-article', payload),
  exportNotesPdf: (payload) => ipcRenderer.invoke('pdf:export-notes', payload),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizeChange: (callback) => {
      const listener = (_event, value) => callback(!!value);
      ipcRenderer.on('window:maximized-changed', listener);
      return () => ipcRenderer.removeListener('window:maximized-changed', listener);
    },
  },
});

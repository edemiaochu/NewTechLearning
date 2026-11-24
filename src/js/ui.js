/* Small DOM / formatting helpers shared by the renderer. */

const ICONS = {
  search:
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  refresh:
    '<path d="M20.5 11a8.5 8.5 0 1 0-2.4 6"/><path d="M20.5 4.5V12H13"/>',
  palette:
    '<circle cx="12" cy="12" r="9"/><circle cx="8.6" cy="9.8" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="9.8" r="1" fill="currentColor" stroke="none"/><path d="M12 21c1.7 0 3-1.3 3-3 0-.9-.4-1.7-1-2.2"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  external:
    '<path d="M14 5h5v5M19 5l-8 8"/><path d="M19 14.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5"/>',
  bookmark: '<path d="M6 4h12v17l-6-4-6 4V4z"/>',
  note: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
  sparkle:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/><path d="M19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16z"/>',
  overview:
    '<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>',
  rss:
    '<path d="M5 5a14 14 0 0 1 14 14M5 11a8 8 0 0 1 8 8"/><circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trash:
    '<path d="M4 7h16M9.5 7V4.8h5V7M7 7l1 13h8l1-13M10 11v5M14 11v5"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  alert:
    '<path d="M12 4 2.8 20h18.4L12 4z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
  globe:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5z"/>',
  filter: '<path d="M4 5h16l-6.2 7.2V19l-3.6 1.5v-8.3L4 5z"/>',
  book: '<path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12v18H7a2.5 2.5 0 0 0-2.5 2.5V5.5z"/><path d="M4.5 18.5A2.5 2.5 0 0 1 7 16h12"/>',
  message:
    '<path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3.5 2 1-4.2A7.5 7.5 0 0 1 11 3.9h2a7.5 7.5 0 0 1 7.5 7.6z"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/>',
  key: '<circle cx="8" cy="15.5" r="3.5"/><path d="m10.5 13 8-8M16 7.5l2 2M18.5 5l2 2"/>',
  frame:
    '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M3.5 9h17M8 5v4"/>',
  zap: '<path d="M13 2 4.5 13.5H11l-1 8.5L19 10h-6.5L13 2z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  minus: '<path d="M5 12h14"/>',
  'layout-center':
    '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="6.5" width="6" height="11" rx="1"/>',
  'layout-split': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M14 4v16"/>',
  'layout-fullscreen':
    '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  grip: '<path d="M7 17h10M10 13h7M13 9h4"/>',
  pen: '<path d="M4 20l4.6-.9L19 8.7a2.1 2.1 0 0 0-3-3L5.6 16.1 4 20z"/><path d="M14 6l4 4"/>',
  eraser:
    '<path d="m7 17-3-3a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l4 4a2 2 0 0 1 0 2.8L12 18H7z"/><path d="m9 15 6-6M4 21h16"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M4 12h10a5 5 0 0 1 0 10h-3"/>',
  flame:
    '<path d="M12.5 3c.8 3.1-1.3 4.5-2.8 6.1-1.3 1.4-2.1 2.9-2.1 4.7a5.2 5.2 0 0 0 10.4 0c0-1.6-.6-3-1.6-4.3.1 1-.3 2-1.1 2.6.1-3.2-1.7-5.5-3.6-7.4"/>',
  newspaper:
    '<path d="M5 4.5h13.5V20H6.5A2.5 2.5 0 0 1 4 17.5V6.2A1.7 1.7 0 0 1 5.7 4.5"/><path d="M18.5 8H21v9.5A2.5 2.5 0 0 1 18.5 20"/><path d="M7.5 8h7M7.5 11.5h7M7.5 15h4.5"/>',
};

export function icon(name, options = {}) {
  const path = ICONS[name] || ICONS.sparkle;
  const fill = options.fill ? 'currentColor' : 'none';
  const stroke = options.fill ? 'none' : 'currentColor';
  const size = options.size ? ` width="${options.size}" height="${options.size}"` : '';
  return `<svg viewBox="0 0 24 24"${size} fill="${fill}" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function esc(value) {
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

export function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function formatShort(value) {
  const date = parseDate(value);
  if (!date) return '时间未知';
  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
}

export function formatDateTime(value) {
  const date = parseDate(value);
  if (!date) return '时间未知';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;
}

export function todayLabel(date = new Date()) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 · ${WEEKDAYS[date.getDay()]}`;
}

export function timeAgo(value) {
  const date = parseDate(value);
  if (!date) return '时间未知';
  const diff = Date.now() - date.getTime();
  if (diff < 0) return formatShort(date);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  return formatShort(date);
}

export function syncLabel(updatedAt) {
  if (!updatedAt) return '尚未同步';
  return `最后同步 · ${timeAgo(updatedAt)}`;
}

export function debounce(fn, wait = 300) {
  let timer = null;
  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  wrapped.flush = (...args) => {
    if (timer) clearTimeout(timer);
    timer = null;
    fn(...args);
  };
  return wrapped;
}

export function toast(message, tone = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `app-toast${tone === 'success' ? ' is-success' : tone === 'warn' ? ' is-warn' : ''}`;
  const iconName = tone === 'warn' ? 'alert' : tone === 'success' ? 'check' : 'sparkle';
  el.innerHTML = `${icon(iconName)}<span>${esc(message)}</span>`;
  el.style.transition = 'opacity 220ms ease, transform 220ms ease';
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => el.remove(), 240);
  }, 3200);
}

export function clampText(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function countBy(list, key) {
  const map = new Map();
  for (const item of list) {
    const value = typeof key === 'function' ? key(item) : item[key];
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

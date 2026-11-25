/**
 * Optical liquid-glass integration (WebGL2).
 *
 * One fixed canvas sits behind the app shell. Only the chrome layers that are
 * transparent all the way down to the canvas take part: titlebar, sidebar,
 * search field, toolbar clusters and window controls. Sidebar rows are plain
 * CSS rows on the single sidebar glass surface; the main content stage is
 * opaque/static (like PDF-Reader's PDF page). CSS overlay layers (modals,
 * popovers, reader) keep the CSS glass fallback.
 *
 * The environment palette is derived from the app's own design tokens, so all
 * six themes (aurora/ocean/forest/ember/violet/light) keep their identity.
 */
import { attachGlassSurface, createLiquidGlass } from '../liquid-glass/vanilla.js';
import { PRESETS } from '../liquid-glass/presets.js';

const LIGHT_THEME = 'light';
const GLASS_BACKGROUNDS = ['clean', 'specimen', 'solid'];
const CSS_TOKEN = {
  base: '--bg-app',
  accent: '--accent-primary',
  accentAlt: '--accent-secondary',
  ambientBlue: '--ambient-blue',
};

const STATIC_SURFACES = [
  {
    selector: '#titlebar',
    config: {
      radius: 0,
      layer: 1,
      tintOpacity: 0.3,
      bevelScale: 1.1,
      thicknessScale: 1.05,
    },
  },
  {
    selector: '#sidebar',
    config: {
      radius: 0,
      layer: 1,
      tintOpacity: 0.26,
      bevelScale: 1.1,
      thicknessScale: 1.05,
    },
  },
  {
    selector: '.app-search',
    config: {
      radius: 12,
      layer: 3,
      tintOpacity: 0.18,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      interactive: true,
    },
  },
  {
    selector: '.app-tool-cluster',
    config: {
      radius: 16,
      layer: 3,
      tintOpacity: 0.16,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      interactive: true,
    },
  },
  {
    selector: '.app-nav-cluster',
    config: {
      radius: 16,
      layer: 3,
      tintOpacity: 0.16,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      interactive: true,
    },
  },
];

let controller = null;
let surfaceTint = '#ffffff';
let backgroundMode = 'clean';
let glassParams = { ...PRESETS.Liquid };

/** Material knobs the bundled optics core understands. */
export const GLASS_PARAM_FIELDS = [
  { key: 'ior', label: '折射率', min: 1, max: 2, step: 0.01 },
  { key: 'thickness', label: '厚度', min: 0, max: 140, step: 1, unit: 'px' },
  { key: 'dispersion', label: '色散', min: 0, max: 1, step: 0.01 },
  { key: 'roughness', label: '粗糙度', min: 0, max: 1, step: 0.01 },
  { key: 'bevel', label: '倒角', min: 0, max: 60, step: 1, unit: 'px' },
];

export function normalizeGlassParams(input) {
  const next = { ...PRESETS.Liquid };
  if (input && typeof input === 'object') {
    for (const field of GLASS_PARAM_FIELDS) {
      const value = Number(input[field.key]);
      if (Number.isFinite(value)) {
        next[field.key] = Math.min(field.max, Math.max(field.min, value));
      }
    }
  }
  return next;
}

export function getGlassParams() {
  return glassParams;
}

export function setGlassParams(params) {
  glassParams = normalizeGlassParams(params);
  controller?.setParams(glassParams);
  return glassParams;
}

function normalizeBackground(mode) {
  return GLASS_BACKGROUNDS.includes(mode) ? mode : 'clean';
}

function baseCssColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(CSS_TOKEN.base)
    .trim();
  return value || 'transparent';
}

function currentTheme() {
  return document.documentElement.dataset.theme === LIGHT_THEME ? 'light' : 'dark';
}

let colorCanvas = null;

/** Resolve any CSS colour (hex, rgb(), rgba(), named) to linear-ish 0..1 RGB. */
function parseColor(value) {
  if (!value) return [0, 0, 0];
  if (!colorCanvas) {
    colorCanvas = document.createElement('canvas');
    colorCanvas.width = 1;
    colorCanvas.height = 1;
  }
  const ctx = colorCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [0, 0, 0];
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255];
}

function tokenColor(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name);
  return parseColor(value.trim());
}

function mix(a, b, amount) {
  const t = Math.min(Math.max(amount, 0), 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Map the active theme tokens into the shader's environment palette. */
function readPalette() {
  const isLight = currentTheme() === 'light';
  const base = tokenColor(CSS_TOKEN.base);
  const accent = tokenColor(CSS_TOKEN.accent);
  const accentAlt = tokenColor(CSS_TOKEN.accentAlt);
  const ambientBlue = tokenColor(CSS_TOKEN.ambientBlue);
  const white = [1, 1, 1];
  const black = [0, 0, 0];

  return {
    baseTop: isLight ? mix(base, white, 0.12) : mix(base, white, 0.06),
    baseBot: isLight ? mix(base, [0.86, 0.88, 0.93], 0.22) : mix(base, black, 0.58),
    blobA: mix(accent, base, 0.18),
    blobB: mix(accentAlt, base, 0.22),
    blobC: mix(accentAlt, base, 0.36),
    blobD: mix(accent, base, 0.44),
    blobE: mix(ambientBlue, base, 0.3),
    stageGlow: mix(accent, base, 0.16),
    cornerGlow: mix(accentAlt, base, 0.26),
    ink: isLight ? [0.075, 0.08, 0.11] : [0.93, 0.95, 1.0],
    blobStrength: isLight ? 0.3 : 0.26,
  };
}

function syncTheme() {
  if (!controller) return;
  controller.setTheme(currentTheme());
  controller.setPalette(readPalette());
  if (backgroundMode === 'solid') controller.setBackgroundColor(baseCssColor());
}

/** Switch the optical environment while the app is running. */
export function applyGlassBackground(mode) {
  const next = normalizeBackground(mode);
  backgroundMode = next;
  if (!controller) return next;
  controller.setBackground(next);
  if (next === 'solid') controller.setBackgroundColor(baseCssColor());
  return next;
}

function surfaceConfig(definition) {
  return { ...definition.config, tint: surfaceTint };
}

function watchTheme() {
  new MutationObserver(syncTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

/**
 * Boot the renderer. Safe to call once; returns false when the platform should
 * keep the existing CSS-only glass (reduced transparency or no WebGL2).
 */
export function initGlass(initialBackground = 'clean', initialParams = null) {
  if (controller) return true;

  const reduceTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  if (reduceTransparency) return false;

  const canvas = document.getElementById('glass-canvas');
  if (!canvas) return false;

  backgroundMode = normalizeBackground(initialBackground);
  glassParams = normalizeGlassParams(initialParams);

  controller = createLiquidGlass({
    canvas,
    params: glassParams,
    theme: currentTheme(),
    palette: readPalette(),
    background: backgroundMode,
    backgroundColor: backgroundMode === 'solid' ? baseCssColor() : undefined,
    onError: (error) => console.warn('[glass] WebGL2 unavailable, keeping CSS glass.', error),
  });
  if (!controller) return false;

  document.documentElement.classList.add('lg-webgl-ready');

  const tintToken = getComputedStyle(document.documentElement)
    .getPropertyValue('--glass-optics-tint')
    .trim();
  if (/^#[0-9a-f]{3,8}$/i.test(tintToken)) surfaceTint = tintToken;

  for (const definition of STATIC_SURFACES) {
    document.querySelectorAll(definition.selector).forEach((element) => {
      attachGlassSurface(element, surfaceConfig(definition));
    });
  }

  watchTheme();

  return true;
}

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
 * The material core comes from the installed `liquid-glass-optics` skill.
 * The optical environment follows the core's Dark/Light theme model; the
 * user-facing theme tokens stay in charge of the CSS surfaces and content.
 */
import { attachGlassSurface, createLiquidGlass } from '../liquid-glass/vanilla.js';
import { PRESETS } from '../liquid-glass/presets.js';
import { DEFAULT_GLASS_STYLE } from '../liquid-glass/types.js';
import { GLASS_BACKGROUND_IMAGES } from './glass-backgrounds.js';

const LIGHT_THEME = 'light';

export const GLASS_BACKGROUND_MODES = ['clean', 'specimen', 'solid', 'image'];

export const GLASS_BACKGROUND_LABELS = {
  clean: '柔光渐变',
  specimen: '光学标定',
  solid: '主题纯色',
  image: '内置图片',
};

/** @typedef {typeof GLASS_PARAM_SECTIONS[number]['fields'][number]} GlassParamField */

export const GLASS_PARAM_SECTIONS = [
  {
    id: 'material',
    title: '材质',
    hint: 'OPTICAL',
    fields: [
      { key: 'ior', label: '折射率', min: 1, max: 2, step: 0.01, decimals: 2 },
      { key: 'thickness', label: '厚度', min: 0, max: 100, step: 1, decimals: 0, unit: 'px' },
      { key: 'dispersion', label: '色散', min: 0, max: 1, step: 0.01, decimals: 2 },
      { key: 'roughness', label: '粗糙度', min: 0, max: 1, step: 0.01, decimals: 2 },
      { key: 'bevel', label: '倒角', min: 0, max: 48, step: 1, decimals: 0, unit: 'px' },
    ],
  },
  {
    id: 'shadow',
    title: '接触阴影',
    hint: 'SHADOW',
    fields: [
      { key: 'shadowLight', label: '亮色强度', min: 0, max: 0.5, step: 0.01, decimals: 2 },
      { key: 'shadowDark', label: '暗色强度', min: 0, max: 0.5, step: 0.01, decimals: 2 },
      { key: 'shadowSoftness', label: '柔和度', min: 4, max: 60, step: 1, decimals: 0, unit: 'px' },
      { key: 'shadowOffsetX', label: '偏移 X', min: -30, max: 30, step: 1, decimals: 0, unit: 'px' },
      { key: 'shadowOffsetY', label: '偏移 Y', min: -30, max: 30, step: 1, decimals: 0, unit: 'px' },
    ],
  },
  {
    id: 'rim',
    title: '边缘高光',
    hint: 'RIM',
    fields: [
      { key: 'rimWidth', label: '宽度', min: 0.5, max: 10, step: 0.1, decimals: 1, unit: 'px' },
      { key: 'rimBase', label: '基础强度', min: 0, max: 1.5, step: 0.01, decimals: 2 },
      { key: 'rimFacing', label: '指向光源', min: 0, max: 2, step: 0.01, decimals: 2 },
      { key: 'rimTop', label: '顶边', min: 0, max: 1, step: 0.01, decimals: 2 },
      { key: 'rimStrength', label: '总强度', min: 0, max: 3, step: 0.01, decimals: 2 },
    ],
  },
  {
    id: 'light',
    title: '高光与反射',
    hint: 'HIGHLIGHT',
    fields: [
      { key: 'specularStrength', label: '指针高光', min: 0, max: 3, step: 0.01, decimals: 2 },
      { key: 'fresnelStrength', label: 'Fresnel', min: 0, max: 3, step: 0.01, decimals: 2 },
      { key: 'innerGlowStrength', label: '内层辉光', min: 0, max: 3, step: 0.01, decimals: 2 },
    ],
  },
];

export const GLASS_PARAM_FIELDS = GLASS_PARAM_SECTIONS.flatMap(
  (section) => section.fields
);

const SURFACE_TINT = '#ffffff';

const STATIC_SURFACES = [
  {
    selector: '#titlebar',
    config: {
      radius: 0,
      layer: 1,
      tintOpacity: 0.16,
      bevelScale: 0.25,
      thicknessScale: 0.45,
      refractionScale: 1,
    },
  },
  {
    selector: '#sidebar',
    config: {
      radius: 0,
      layer: 1,
      tintOpacity: 0.16,
      bevelScale: 0.25,
      thicknessScale: 0.45,
      refractionScale: 1,
    },
  },
  {
    selector: '.app-search',
    config: {
      radius: 16,
      layer: 2,
      tintOpacity: 0.16,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      refractionScale: 1.15,
      interactive: true,
    },
  },
  {
    selector: '.app-tool-cluster',
    config: {
      radius: 16,
      layer: 2,
      tintOpacity: 0.16,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      refractionScale: 1.15,
      interactive: true,
    },
  },
  {
    selector: '.app-nav-cluster',
    config: {
      radius: 16,
      layer: 2,
      tintOpacity: 0.16,
      bevelScale: 0.55,
      thicknessScale: 0.7,
      refractionScale: 1.15,
      interactive: true,
    },
  },
];

let controller = null;
let surfaceCleanups = [];
let themeObserver = null;
let backgroundMode = 'clean';
let backgroundAnimation = false;
let glassParams = normalizeGlassParams(null);

function defaults() {
  return { ...PRESETS.Liquid, ...DEFAULT_GLASS_STYLE };
}

export function normalizeGlassParams(input) {
  const next = defaults();
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

export function formatGlassParam(field, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toFixed(field.decimals ?? 2);
}

export function getGlassParams() {
  return { ...glassParams };
}

/** Apply material/lighting values live; returns the clamped set. */
export function setGlassParams(params) {
  glassParams = normalizeGlassParams(params);
  controller?.setParams(glassParams);
  return { ...glassParams };
}

function normalizeBackground(mode) {
  return GLASS_BACKGROUND_MODES.includes(mode) ? mode : 'clean';
}

function currentTheme() {
  return document.documentElement.dataset.theme === LIGHT_THEME ? 'light' : 'dark';
}

function currentBackgroundImage() {
  return currentTheme() === 'light'
    ? GLASS_BACKGROUND_IMAGES.light
    : GLASS_BACKGROUND_IMAGES.dark;
}

function baseCssColor() {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--bg-app')
    .trim();
  return value || 'transparent';
}

function syncTheme() {
  if (!controller) return;
  controller.setTheme(currentTheme());
  if (backgroundMode === 'image') {
    controller.setBackgroundImage(currentBackgroundImage());
  }
  if (backgroundMode === 'solid') controller.setBackgroundColor(baseCssColor());
}

function watchTheme() {
  if (themeObserver) return;
  themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

function detachSurfaces() {
  for (const detach of surfaceCleanups) detach();
  surfaceCleanups = [];
}

function attachSurfaces() {
  detachSurfaces();
  for (const definition of STATIC_SURFACES) {
    document.querySelectorAll(definition.selector).forEach((element) => {
      const detach = attachGlassSurface(element, {
        ...definition.config,
        tint: SURFACE_TINT,
      });
      surfaceCleanups.push(detach);
    });
  }
}

/**
 * Boot the renderer. Safe to call more than once; returns false when the
 * platform should keep the existing CSS-only glass (optical off, reduced
 * transparency, or no WebGL2).
 */
export function initGlass(initialBackground = 'clean', initialParams = null, options = {}) {
  if (controller) return true;
  if (options.enabled === false) {
    document.documentElement.classList.add('lg-optical-off');
    return false;
  }

  const reduceTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;
  if (reduceTransparency) {
    document.documentElement.classList.add('lg-optical-off');
    return false;
  }

  const canvas = document.getElementById('glass-canvas');
  if (!canvas) return false;

  backgroundMode = normalizeBackground(initialBackground);
  glassParams = normalizeGlassParams(initialParams);
  backgroundAnimation = !!options.animation;

  controller = createLiquidGlass({
    canvas,
    params: glassParams,
    theme: currentTheme(),
    background: backgroundMode,
    backgroundImage: backgroundMode === 'image' ? currentBackgroundImage() : undefined,
    backgroundColor: backgroundMode === 'solid' ? baseCssColor() : undefined,
    backgroundAnimation,
    onError: (error) => console.warn('[glass] WebGL2 unavailable, keeping CSS glass.', error),
  });
  if (!controller) {
    document.documentElement.classList.add('lg-optical-off');
    return false;
  }

  document.documentElement.classList.remove('lg-optical-off');
  document.documentElement.classList.add('lg-webgl-ready');

  attachSurfaces();
  watchTheme();

  return true;
}

/** Tear the renderer down and fall back to the CSS glass immediately. */
export function destroyGlass() {
  detachSurfaces();
  controller?.destroy();
  controller = null;
  document.documentElement.classList.remove('lg-webgl-ready');
  document.documentElement.classList.add('lg-optical-off');
}

/** Runtime on/off switch used by the appearance panel and settings. */
export function setGlassEnabled(enabled) {
  if (!enabled) {
    destroyGlass();
    return false;
  }
  if (controller) return true;
  return initGlass(backgroundMode, glassParams, {
    enabled: true,
    animation: backgroundAnimation,
  });
}

export function isGlassEnabled() {
  return !!controller;
}

/** Switch the optical environment while the app is running. */
export function applyGlassBackground(mode) {
  const next = normalizeBackground(mode);
  backgroundMode = next;
  if (!controller) return next;
  controller.setBackground(next);
  if (next === 'image') controller.setBackgroundImage(currentBackgroundImage());
  if (next === 'solid') controller.setBackgroundColor(baseCssColor());
  return next;
}

/** Drift the procedural colour fields (off by default). */
export function applyGlassAnimation(enabled) {
  backgroundAnimation = !!enabled;
  controller?.setBackgroundAnimation(backgroundAnimation);
  return backgroundAnimation;
}

# Liquid Glass core (vanilla WebGL2)

Copied from the `liquid-glass-optics` skill (`assets/core`), then trimmed to the
framework-free runtime used by this app. React (`components/`, `GlassCanvas.tsx`,
`GlassSurface.tsx`), the native Web Component layer and the framework-free
settings panel are not included — the app drives `attachGlassSurface` directly
from `src/js/glass.js` and renders its own 18-field material panel.

## Files

| File | Role |
| --- | --- |
| `core.css` | Fixed canvas + `.lg-surface` host styles and no-WebGL fallback |
| `registry.js` | Measures registered DOM rects every frame |
| `shaders.js` | Background pass + glass composite (GLSL ES 3.00) |
| `renderer.js` | Two-pass WebGL2 renderer, DPR/pixel cap, pointer tracking, background animation |
| `vanilla.js` | `createLiquidGlass` + `attachGlassSurface` API |
| `presets.js` | `Crystal / Liquid / Heavy / Frost` material presets |
| `types.js` | `DEFAULT_GLASS_STYLE` + `resolveGlassStyle` for the 13 style knobs |
| `backgroundImages.js` | Built-in `Optical Chart` preset metadata (webp paths) |
| `backgrounds/` | Light/dark `Optical Chart` webp pair |
| `*.ts` | TypeScript sources for the files above |

## Local changes vs. the skill core

- **Per-shape clipping (available).** `GlassConfig.clip` intersects a shape with
  a scroll/viewport container. It is kept for future scrollable glass lists;
  the current sidebar is a single glass surface with plain CSS rows, so no row
  currently uses it. This is the only local extension kept on top of upstream.
- **Compiled JS is checked in.** The app has no bundler, so every upstream
  `.ts` change must be recompiled; see “Upstream sync” below.
- **Background image is embedded as data URLs.** Electron loads the renderer
  from `file://`, where Chromium refuses WebGL textures from cross-origin
  `<img>` elements. `scripts/build-glass-backgrounds.js` converts the upstream
  webp pair into `src/js/glass-backgrounds.js`, so image mode works under the
  renderer CSP (`img-src data:`).

## Upstream sync (2026-11-25)

Synced to the current `liquid-glass-optics` core:

- **18 material/style fields.** Upstream added `GlassStyle` (`shadowLight`,
  `shadowDark`, `shadowSoftness`, `shadowOffsetX/Y`, `rimWidth`, `rimBase`,
  `rimFacing`, `rimTop`, `rimStrength`, `specularStrength`, `fresnelStrength`,
  `innerGlowStrength`) merged into `GlassParams`. The app exposes all 18 in the
  material panel; defaults are `PRESETS.Liquid` + `DEFAULT_GLASS_STYLE`.
- **Token palette removed upstream.** The procedural environment now follows
  the core's `dark` / `light` theme model instead of a host palette. `glass.js`
  no longer calls `setPalette()`; `light` is the only theme mapped to the light
  environment.
- **Background modes.** `clean` / `specimen` / `solid` / `image`; image mode
  uses the built-in theme-matched Optical Chart. Background drift is explicit
  (`backgroundAnimation`, off by default) and freezes under
  `prefers-reduced-motion`.
- **Surface tuning follows the upstream table:** toolbar clusters `layer 2,
  tint .16, bevel .55, thickness .7, refraction 1.15`; large chrome surfaces
  `layer 1, tint .16, bevel .25, thickness .45, refraction 1`. `MAX_SHAPES` is
  the upstream 32.

## Rebuilding the JS

The app has no bundler, so the compiled `.js` files are checked in. After
syncing the upstream `.ts` sources, recompile with a local TypeScript CLI:

```bash
rm -rf /tmp/glass-build
tsc --target ES2020 --module ES2020 --moduleResolution bundler \
  --lib ES2020,DOM,DOM.Iterable --skipLibCheck --outDir /tmp/glass-build \
  src/liquid-glass/{types,presets,registry,shaders,renderer,vanilla,backgroundImages}.ts
cd /tmp/glass-build
sed -i '' 's|from "\./\([A-Za-z0-9_-]*\)"|from "./\1.js"|g' *.js
cp *.js "$OLDPWD/src/liquid-glass/"
```

Browser ES modules require explicit `.js` extensions; the `sed` step adds them
to the compiler output. Do not copy the upstream `registry.ts` over this copy
without re-applying the `GlassConfig.clip` extension.

Rebuild the embedded image backgrounds after the upstream webp pair changes:

```bash
npm run glass-bg
```

## Rules

- Mount exactly one canvas (`#glass-canvas` in `index.html`) behind the UI.
- A registered surface must be transparent all the way down to the canvas; its
  material comes from the shader, not CSS.
- Overlays (modal, popover, reader) stay on the CSS glass fallback because the
  page canvas cannot paint above DOM content.
- Do not add `backdrop-filter` to `.lg-surface`; only `core.css`'s
  `.lg-no-webgl` fallback may use it.
- In optical mode, buttons inside a capsule must not add their own CSS
  background/border/lift/shadow; only the icon colour changes.

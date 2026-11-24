# Liquid Glass core (vanilla WebGL2)

Copied from the `liquid-glass-optics` skill (`assets/core`), then trimmed to the
framework-free runtime used by this app. React (`components/`, `GlassCanvas.tsx`,
`GlassSurface.tsx`) and the native Web Component layer are not included — the app
drives `attachGlassSurface` directly from `src/js/glass.js`.

## Files

| File | Role |
| --- | --- |
| `core.css` | Fixed canvas + `.lg-surface` host styles and no-WebGL fallback |
| `registry.js` | Measures registered DOM rects every frame |
| `shaders.js` | Background pass + glass composite (GLSL ES 3.00) |
| `renderer.js` | Two-pass WebGL2 renderer, DPR/pixel cap, pointer tracking |
| `vanilla.js` | `createLiquidGlass` + `attachGlassSurface` API |
| `presets.js` | `Crystal / Liquid / Heavy / Frost` material presets |
| `*.ts` | TypeScript sources for the files above |

## Local changes vs. the skill core

- **Token-driven palette.** The procedural environment originally hard-coded
  its light/dark palette. This copy exposes a `GlassPalette` (`types.ts`) and
  `setPalette()`; the background shader (`BACKGROUND_FRAG`) reads
  `uBaseTop/uBaseBot/uBlobA…E/uStageGlow/uCornerGlow/uInk/uBlobStrength`.
  `src/js/glass.js` derives the palette from the active theme's design tokens,
  so all six app themes keep their identity. The specimen rings/dots use
  `uInk` + accent palette colours instead of the skill's fixed purple/orange.
- **Per-shape clipping (available).** `GlassConfig.clip` intersects a shape with
  a scroll/viewport container. It is kept for future scrollable glass lists;
  the current sidebar is a single glass surface with plain CSS rows, so no row
  currently uses it.
- **`MAX_SHAPES` is 40** (renderer + shader); a larger ceiling is kept even
  though the current UI uses only five chrome surfaces.

## Upstream sync (2026-11-24)

The skill updated its Liquid preset and glass shader; this copy follows it:

- `PRESETS.Liquid`: `thickness 84`, `bevel 4` (previously 52 / 36). The narrow
  bevel removes the dark rim without losing the lens edge.
- Contact shadow is disabled by default (`float shadowStrength = 0.0;`), as in
  the updated shader. The tuning doc suggests re-enabling with 0.04–0.07 for
  light and 0.18–0.22 for dark if a scene needs more separation.
- Edge absorption is the upstream `0.90 → 1.0` profile.
- Per-surface multipliers in `src/js/glass.js` follow the updated tuning table:
  large surfaces `bevelScale 1.1 / thicknessScale 1.05`, pills `0.55 / 0.7`,
  small controls `0.5 / 0.55`. The sidebar is one large surface; its rows are
  plain CSS and do not add shapes.

## Rebuilding the JS

The app has no bundler, so the compiled `.js` files are checked in. After
editing a `.ts` file, recompile with the globally installed TypeScript CLI:

```bash
rm -rf /tmp/glass-build
tsc --target ES2022 --module ES2022 --moduleResolution bundler \
  --lib ES2022,DOM --skipLibCheck --outDir /tmp/glass-build \
  src/liquid-glass/{types,registry,shaders,presets,renderer,vanilla}.ts
cd /tmp/glass-build
sed -i '' 's|from "\./\([A-Za-z0-9_-]*\)"|from "./\1.js"|g' *.js
cp *.js "$OLDPWD/src/liquid-glass/"
```

Browser ES modules require explicit `.js` extensions; the `sed` step adds them
to the compiler output.

## Rules

- Mount exactly one canvas (`#glass-canvas` in `index.html`) behind the UI.
- A registered surface must be transparent all the way down to the canvas; its
  material comes from the shader, not CSS.
- Overlays (modal, popover, reader) stay on the CSS glass fallback because the
  page canvas cannot paint above DOM content.
- Do not add `backdrop-filter` to `.lg-surface`; only `core.css`'s
  `.lg-no-webgl` fallback may use it.

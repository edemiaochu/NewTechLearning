/**
 * GLSL ES 3.00 shaders for the Liquid Glass optical lab.
 *
 * Pass 1 renders an animated environment into an offscreen texture.
 * Pass 2 treats that texture as the scene behind the glass and displaces it
 * with a Snell-law approximation, per-channel IOR offsets (dispersion),
 * Fresnel reflection, pointer specular and a lensed bevel.
 */

export const FULLSCREEN_VERT = /* glsl */ `#version 300 es
precision highp float;

void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uTheme;
uniform float uBackgroundMode;
uniform vec3 uSolidColor;

// Host palette (one entry per token-driven colour field).
uniform vec3 uBaseTop;
uniform vec3 uBaseBot;
uniform vec3 uBlobA;
uniform vec3 uBlobB;
uniform vec3 uBlobC;
uniform vec3 uBlobD;
uniform vec3 uBlobE;
uniform vec3 uStageGlow;
uniform vec3 uCornerGlow;
uniform vec3 uInk;
uniform float uBlobStrength;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float blob(vec2 uv, vec2 c, float r, float aspect) {
  vec2 d = uv - c;
  d.x *= aspect;
  // Dark mode uses tighter glows so the black environment still reads black.
  r *= mix(0.7, 1.0, uTheme);
  return exp(-dot(d, d) / (r * r));
}

void main() {
  // Pure color: skip the entire environment composition.
  if (uBackgroundMode > 1.5) {
    outColor = vec4(uSolidColor, 1.0);
    return;
  }

  vec2 cssSize = uRes / uDpr;
  vec2 fragPx = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 uv = fragPx / cssSize;
  float aspect = cssSize.x / cssSize.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float t = uTime;
  float th = uTheme;

  // --- base wash -----------------------------------------------------------
  vec3 col = mix(uBaseTop, uBaseBot, smoothstep(0.05, 0.95, uv.y));

  // --- soft colour fields --------------------------------------------------
  float b1 = blob(uv, vec2(0.10 + sin(t * 0.07) * 0.018, 0.26 + cos(t * 0.09) * 0.016), 0.34, aspect);
  float b2 = blob(uv, vec2(0.53 + cos(t * 0.06) * 0.02, 0.06 + sin(t * 0.11) * 0.018), 0.27, aspect);
  float b3 = blob(uv, vec2(0.83 + sin(t * 0.05) * 0.016, 0.30 + cos(t * 0.08) * 0.02), 0.36, aspect);
  float b4 = blob(uv, vec2(0.25 + sin(t * 0.08) * 0.02, 0.89), 0.33, aspect);
  float b5 = blob(uv, vec2(0.93, 0.88 + sin(t * 0.1) * 0.012), 0.22, aspect);

  vec3 c1 = uBlobA;
  vec3 c2 = uBlobB;
  vec3 c3 = uBlobC;
  vec3 c4 = uBlobD;
  vec3 c5 = uBlobE;

  float strength = uBlobStrength;
  col = mix(col, c1, b1 * strength);
  col = mix(col, c2, b2 * strength);
  col = mix(col, c3, b3 * strength * 0.92);
  col = mix(col, c4, b4 * strength * 0.8);
  col = mix(col, c5, b5 * strength * 0.8);

  // A warm diagonal wash keeps the light theme from feeling flat.
  float wash = exp(-pow((uv.x * 0.7 + uv.y * 0.55 - 0.55) * 2.6, 2.0));
  col = mix(col, mix(vec3(1.0, 0.92, 0.84), vec3(1.0, 0.97, 0.93), th), wash * 0.18 * th);

  if (uBackgroundMode > 0.5) {
    // --- optical specimen: concentric rings behind the glass card ----------
    vec2 rc = vec2(cssSize.x * 0.675, cssSize.y * 0.475);
    vec2 rq = fragPx - rc;
    float rr = length(rq);

    vec3 sunCol = uStageGlow;
    col = mix(col, sunCol, exp(-rr * rr / 52000.0) * mix(0.30, 0.17, th));

    float core = 1.0 - smoothstep(58.0, 62.0, rr);
    col = mix(col, uBlobA, core * 0.42);

    vec3 ink = uInk;
    float ringPhase = cos(rr * 6.2831853 / 24.0);
    float ringLine = smoothstep(0.925, 0.999, ringPhase);
    float ringFade = (1.0 - smoothstep(230.0, 640.0, rr)) * smoothstep(66.0, 92.0, rr);
    col = mix(col, ink, ringLine * ringFade * mix(0.3, 0.18, th));

    float ring2 = smoothstep(0.994, 0.9995, cos(rr * 6.2831853 / 72.0));
    col = mix(col, ink, ring2 * (1.0 - smoothstep(340.0, 780.0, rr)) * 0.07);

    // A single cobalt arc on the opposite side.
    vec2 lc = vec2(cssSize.x * 0.045, cssSize.y * 0.63);
    float lr = length(fragPx - lc);
    float arcRadius = min(cssSize.x, cssSize.y) * 0.55;
    float arc = 1.0 - smoothstep(0.4, 1.4, abs(lr - arcRadius));
    col = mix(col, uCornerGlow, arc * 0.10);

    // --- measurement grid --------------------------------------------------
    vec2 cell = fract(fragPx / 26.0) - 0.5;
    float dotMask = smoothstep(0.085, 0.025, length(cell));
    col = mix(col, ink, dotMask * mix(0.2, 0.12, th));

    vec2 cellFine = fract(fragPx / 13.0) - 0.5;
    float dotFine = smoothstep(0.05, 0.012, length(cellFine));
    col = mix(col, ink, dotFine * mix(0.06, 0.03, th));

    // Fine drafting lines give the lens something to bend across the whole UI.
    vec2 lineGrid = abs(fract(fragPx / 64.0 + 0.5) - 0.5) * 64.0;
    float draftLine = 1.0 - smoothstep(0.0, 0.55, min(lineGrid.x, lineGrid.y));
    col = mix(col, ink, draftLine * mix(0.04, 0.03, th));

    // Slightly stronger registration marks every 130 px.
    vec2 cell2 = fract(fragPx / 130.0) - 0.5;
    float mark = max(
      smoothstep(0.006, 0.0, abs(cell2.x)) * smoothstep(0.055, 0.0, abs(cell2.y)),
      smoothstep(0.006, 0.0, abs(cell2.y)) * smoothstep(0.055, 0.0, abs(cell2.x))
    );
    col = mix(col, ink, mark * 0.10);
  } else {
    // --- clean studio environment ------------------------------------------
    // One broad soft light behind the glass. No rings, dots or drafting lines.
    vec2 stageCenter = vec2(cssSize.x * 0.675, cssSize.y * 0.475);
    vec2 stageDelta = fragPx - stageCenter;
    float stageFalloff = exp(-dot(stageDelta, stageDelta) / 78000.0);
    col = mix(col, uStageGlow, stageFalloff * mix(0.28, 0.18, th));

    // A slightly tighter soft core gives the lens a color edge to bend,
    // while remaining a single clean light source (no rings or grid).
    float softCore = 1.0 - smoothstep(60.0, 260.0, length(stageDelta));
    col = mix(col, uStageGlow, softCore * mix(0.10, 0.08, th));

    vec2 cornerDelta = fragPx - vec2(cssSize.x * 0.16, cssSize.y * 0.92);
    col = mix(
      col,
      uCornerGlow,
      exp(-dot(cornerDelta, cornerDelta) / 110000.0) * 0.06
    );
  }

  // --- atmosphere ----------------------------------------------------------
  float cornerGlow = exp(-dot(p - vec2(-0.62, -0.58), p - vec2(-0.62, -0.58)) * 3.4);
  col += uCornerGlow * cornerGlow * 0.055;

  float vignette = 1.0 - smoothstep(0.35, 1.2, length(p)) * 0.055;
  col *= vignette;

  float grain = hash21(fragPx + floor(t * 10.0) * 31.7) - 0.5;
  col += grain * 0.014;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export const GLASS_FRAG = /* glsl */ `#version 300 es
precision highp float;

#define MAX_SHAPES 40

uniform vec2  uRes;
uniform float uDpr;
uniform float uTime;
uniform float uTheme;
uniform vec2  uPointer;
uniform sampler2D uBg;
uniform float uMaxLod;

uniform float uIor;
uniform float uThickness;
uniform float uDispersion;
uniform float uRoughness;
uniform float uBevel;
uniform int   uShapeCount;

uniform vec4 uRect[MAX_SHAPES];   // x, y, w, h (CSS px)
uniform vec4 uProps[MAX_SHAPES];  // radius, bevel, hover, press
uniform vec4 uTint[MAX_SHAPES];   // rgb, opacity
uniform vec4 uExtra[MAX_SHAPES];  // thickness scale, refraction scale

out vec4 outColor;

const float TAU = 6.28318530718;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

vec2 gradRoundedRect(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  vec2 g;
  if (q.x > 0.0 && q.y > 0.0) {
    g = normalize(max(q, 0.0) + vec2(1e-5));
  } else if (q.x > q.y) {
    g = vec2(1.0, 0.0);
  } else {
    g = vec2(0.0, 1.0);
  }
  return g * sign(p + vec2(1e-5));
}

vec3 sampleBg(vec2 cssPos, float lod) {
  vec2 cssSize = uRes / uDpr;
  vec2 uv = vec2(cssPos.x / cssSize.x, 1.0 - cssPos.y / cssSize.y);
  return textureLod(uBg, clamp(uv, vec2(0.001), vec2(0.999)), lod).rgb;
}

vec2 refractOffset(vec3 N, float ior, float strength) {
  vec3 I = vec3(0.0, 0.0, -1.0);
  vec3 R = refract(I, N, 1.0 / max(ior, 1.001));
  if (dot(R, R) < 1e-5) {
    R = vec3(N.xy * 0.5, -0.85);
    R = normalize(R);
  }
  return (R.xy / max(-R.z, 0.16)) * strength;
}

void main() {
  vec2 cssSize = uRes / uDpr;
  vec2 screenPx = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;

  // The unmodified environment, visible everywhere outside the glass.
  vec2 bgUv = vec2(gl_FragCoord.x / uRes.x, gl_FragCoord.y / uRes.y);
  vec3 col = textureLod(uBg, bgUv, 0.0).rgb;

  for (int i = 0; i < MAX_SHAPES; i++) {
    if (i >= uShapeCount) break;

    vec4 rect = uRect[i];
    vec2 halfSize = rect.zw * 0.5;
    vec2 center = rect.xy + halfSize;
    vec2 p = screenPx - center;
    float radius = uProps[i].x;
    float sd = sdRoundedRect(p, halfSize, radius);

    if (sd > 90.0) continue;

    // --- soft contact shadow ------------------------------------------------
    float sdShadow = sdRoundedRect(p - vec2(2.0, 11.0), halfSize, radius);
    float shadow = exp(-max(sdShadow, 0.0) / 19.0);
    shadow *= smoothstep(-16.0, 7.0, sdShadow);
    // Contact shadow disabled (upstream default). Set a non-zero strength to
    // bring it back: light theme 0.04-0.07, dark theme 0.18-0.22.
    float shadowStrength = 0.0;
    col *= 1.0 - shadow * shadowStrength;

    if (sd > 1.4) continue;

    float hover = uProps[i].z;
    float press = uProps[i].w;
    float lift = 1.0 + hover * 0.14 - press * 0.10;

    // Small shapes get a smaller bevel so pills never turn into slivers.
    float bevel = min(uProps[i].y * lift, min(halfSize.x, halfSize.y) * 0.92);
    bevel = max(bevel, 1.0);
    float edgeDist = max(-sd, 0.0);
    float t = clamp(edgeDist / bevel, 0.0, 1.0);
    vec2 gr = gradRoundedRect(p, halfSize, radius);

    float thickness = uThickness * uExtra[i].x * lift;
    float thicknessN = clamp(thickness / 100.0, 0.05, 1.5);

    // Quarter-round bevel: steepest at the rim, flat at the center. This is
    // the part that compresses the scene into a bright, lens-like edge.
    float slopeProfile = 1.5707963 * cos(t * 1.5707963);
    float riseRatio = clamp(thickness * 0.38 / bevel, 0.0, 1.45);
    vec3 N = normalize(vec3(gr * slopeProfile * riseRatio, 1.0));

    float aa = max(fwidth(sd), 0.6 / uDpr);
    float cover = 1.0 - smoothstep(-aa, aa, sd);

    // --- refraction, split per RGB channel ---------------------------------
    float strength = thickness * 0.78 * uExtra[i].y;
    float dispersion = uDispersion;

    vec2 offR = refractOffset(N, uIor * (1.0 - 0.30 * dispersion), strength);
    vec2 offG = refractOffset(N, uIor, strength);
    vec2 offB = refractOffset(N, uIor * (1.0 + 0.30 * dispersion), strength);

    // A little extra lateral separation makes the fringe readable at small
    // sizes without having to use unphysical IOR values.
    vec2 fringe = gr * dispersion * 1.4 * (1.0 - t) * smoothstep(0.0, 0.25, t);
    offR += fringe;
    offB -= fringe;

    float lod = clamp(uRoughness * 4.5, 0.0, uMaxLod);

    vec3 bg;
    bg.r = sampleBg(screenPx + offR, lod).r;
    bg.g = sampleBg(screenPx + offG, lod).g;
    bg.b = sampleBg(screenPx + offB, lod).b;

    // --- tint / absorption --------------------------------------------------
    vec3 tintCol = mix(uTint[i].rgb * 0.26, uTint[i].rgb, uTheme);
    float tintAmount = clamp(
      uTint[i].a * (0.85 + uRoughness * 0.35) + uRoughness * 0.08,
      0.0,
      0.86
    );
    vec3 glass = mix(bg, tintCol, tintAmount);

    // Vividness through the glass.
    float luma = dot(glass, vec3(0.2126, 0.7152, 0.0722));
    glass = mix(vec3(luma), glass, 1.16 + 0.08 * (1.0 - uRoughness));

    // Thicker, slightly denser edges.
    glass *= mix(0.90, 1.0, smoothstep(0.0, 0.65, t));

    // --- view + Fresnel -----------------------------------------------------
    vec2 npos = p / max(halfSize, vec2(1.0));
    vec3 V = normalize(vec3(npos * 0.18, 1.0));
    float NdV = clamp(dot(N, V), 0.0, 1.0);
    float fres = 0.04 + 0.96 * pow(1.0 - NdV, 5.0);
    vec3 R = reflect(-V, N);

    vec2 localPointer = clamp((uPointer - center) / max(halfSize, vec2(1.0)), vec2(-2.5), vec2(2.5));
    vec3 envLightDir = normalize(vec3(localPointer * 0.72, 1.0));

    vec3 envLow = mix(vec3(0.012, 0.018, 0.035), vec3(0.50, 0.54, 0.64), uTheme);
    vec3 envHigh = mix(vec3(0.16, 0.21, 0.34), vec3(1.0, 0.985, 0.95), uTheme);
    vec3 env = mix(envLow, envHigh, smoothstep(-0.7, 0.9, R.y));
    float softbox = pow(max(dot(R, envLightDir), 0.0), 8.0);
    vec3 boxCol = mix(vec3(0.45, 0.68, 1.0), vec3(1.0, 0.93, 0.82), uTheme);
    env += boxCol * softbox * 0.5;

    glass += env * fres * 0.34;

    // --- pointer specular ---------------------------------------------------
    vec3 L = normalize(vec3(uPointer - screenPx, 210.0));
    vec3 H = normalize(L + V);
    float ndh = max(dot(N, H), 0.0);
    float spec = pow(ndh, 260.0) * 0.24 + pow(ndh, 90.0) * 0.018;
    // Keep the highlight on grazing angles so it never washes out UI labels.
    spec *= 0.1 + 0.9 * smoothstep(0.03, 0.45, fres);
    spec *= 0.8 + 0.2 * hover;
    vec3 specCol = mix(vec3(0.82, 0.92, 1.0), vec3(1.0, 0.96, 0.88), uTheme);
    glass += specCol * spec;

    // --- rim light ----------------------------------------------------------
    float rim = smoothstep(2.6, 0.0, edgeDist);
    vec2 toPointer = normalize(uPointer - screenPx + vec2(1e-4));
    float rimFacing = max(dot(gr, toPointer), 0.0);
    float topBias = smoothstep(-0.15, 0.95, -gr.y);
    vec3 rimCol = mix(vec3(0.74, 0.86, 1.0), vec3(1.0, 0.995, 0.975), uTheme);
    float rimPower = 0.30 + 0.52 * rimFacing + 0.16 * topBias;
    glass += rimCol * rim * rimPower * (0.62 + 0.55 * fres) * (1.0 + 0.22 * hover);

    // Wide, faint inner sheen along the bevel.
    float innerGlow = (1.0 - smoothstep(0.0, 0.6, t)) * smoothstep(0.0, 0.05, t);
    glass += rimCol * innerGlow * (0.014 + 0.05 * fres) * (1.0 + 0.25 * hover);

    // --- tinted hover / press response -------------------------------------
    glass = mix(glass, tintCol, press * 0.05 + hover * 0.02);

    col = mix(col, glass, cover);
  }

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

/**
 * Pass 1 alternative for a custom background image.
 * Cover-fits the image, then applies a theme-aware veil/vignette so DOM text
 * and the glass remain readable. The renderer draws this into the same
 * mipmapped framebuffer texture used by the glass pass.
 */
export const IMAGE_BACKGROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 uRes;
uniform float uDpr;
uniform float uTheme;
uniform float uImageAspect;
uniform sampler2D uImage;

out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  // Screen UV in top-left space; flip for the image's natural orientation.
  vec2 uv = vec2(gl_FragCoord.x / uRes.x, 1.0 - gl_FragCoord.y / uRes.y);
  float canvasAspect = uRes.x / uRes.y;

  // Cover fit: fill the canvas, crop the excess.
  vec2 st = uv;
  if (canvasAspect > uImageAspect) {
    st.y = (st.y - 0.5) * (uImageAspect / canvasAspect) + 0.5;
  } else {
    st.x = (st.x - 0.5) * (canvasAspect / uImageAspect) + 0.5;
  }

  vec3 col = texture(uImage, st).rgb;

  // Theme veil, strongest on the left where copy usually sits.
  vec3 veilCol = mix(vec3(0.012, 0.016, 0.035), vec3(0.985, 0.97, 0.94), uTheme);
  float side = smoothstep(0.12, 0.78, 1.0 - uv.x);
  float veil = mix(0.16, 0.08, uTheme) + side * mix(0.44, 0.30, uTheme);
  float topVeil = (1.0 - smoothstep(0.0, 0.2, uv.y)) * mix(0.10, 0.05, uTheme);
  col = mix(col, veilCol, veil + topVeil);

  // Soft vignette + grain to match the procedural environment.
  vec2 p = (uv - 0.5) * vec2(canvasAspect, 1.0);
  col *= 1.0 - smoothstep(0.3, 1.15, length(p)) * mix(0.26, 0.1, uTheme);
  col += (hash21(gl_FragCoord.xy + 11.0) - 0.5) * 0.012;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

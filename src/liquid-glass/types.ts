export type Theme = "light" | "dark";

export type BackgroundMode = "clean" | "specimen" | "image" | "solid";

export type BackgroundImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas;

/**
 * Visual-only knobs for the glass material. Unlike `ior` / `thickness` /
 * `bevel` these do not change the optical model; they let an app tune the
 * shadow and highlight language without forking the shader.
 *
 * All fields are optional. Missing or non-finite values fall back to
 * `DEFAULT_GLASS_STYLE` (see `resolveGlassStyle`).
 */
export type GlassStyle = {
  /** Contact shadow strength in light theme, 0..1. 0 disables it. */
  shadowLight?: number;
  /** Contact shadow strength in dark theme, 0..1. 0 disables it. */
  shadowDark?: number;
  /** Shadow falloff in CSS pixels. Larger is softer. */
  shadowSoftness?: number;
  /** Shadow offset in CSS pixels. */
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  /** Width of the inner rim highlight in CSS pixels. */
  rimWidth?: number;
  /** Rim intensity at rest, and extra intensity toward the pointer / top edge. */
  rimBase?: number;
  rimFacing?: number;
  rimTop?: number;
  /** Global multiplier for the rim, specular, Fresnel and inner glow terms. */
  rimStrength?: number;
  specularStrength?: number;
  fresnelStrength?: number;
  innerGlowStrength?: number;
};

export type GlassParams = {
  /** Index of refraction. */
  ior: number;
  /** Optical thickness in CSS pixels. */
  thickness: number;
  /** 0..1 RGB separation. */
  dispersion: number;
  /** 0..1 mip-based frosted diffusion. */
  roughness: number;
  /** Bevel width in CSS pixels. */
  bevel: number;
} & GlassStyle;

/** Resolved defaults for every GlassStyle option. */
export const DEFAULT_GLASS_STYLE: Required<GlassStyle> = {
  shadowLight: 0,
  shadowDark: 0,
  shadowSoftness: 19,
  shadowOffsetX: 2,
  shadowOffsetY: 11,
  rimWidth: 2.6,
  rimBase: 0.3,
  rimFacing: 0.52,
  rimTop: 0.16,
  rimStrength: 1,
  specularStrength: 1,
  fresnelStrength: 1,
  innerGlowStrength: 1,
};

/** Merge partial style values over the defaults, ignoring undefined/NaN. */
export function resolveGlassStyle(
  style: GlassStyle | GlassParams = {},
): Required<GlassStyle> {
  const resolved = { ...DEFAULT_GLASS_STYLE };
  for (const key of Object.keys(DEFAULT_GLASS_STYLE) as (keyof GlassStyle)[]) {
    const value = style[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      resolved[key] = value;
    }
  }
  return resolved;
}

export type PresetName = "Crystal" | "Liquid" | "Heavy" | "Frost";

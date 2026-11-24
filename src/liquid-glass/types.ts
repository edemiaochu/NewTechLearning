export type Theme = "light" | "dark";

export type BackgroundMode = "clean" | "specimen" | "image" | "solid";

export type BackgroundImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas;

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
};

export type RGB = [number, number, number];

/**
 * Host palette for the procedural environment. The shader no longer hard-codes
 * its colours, so an app that ships several themes can map its tokens straight
 * into the optical background.
 */
export type GlassPalette = {
  baseTop: RGB;
  baseBot: RGB;
  blobA: RGB;
  blobB: RGB;
  blobC: RGB;
  blobD: RGB;
  blobE: RGB;
  stageGlow: RGB;
  cornerGlow: RGB;
  /** High-contrast line/dot colour for the specimen background. */
  ink: RGB;
  /** 0..1 — overall strength of the colour fields. */
  blobStrength: number;
};

export type PresetName = "Crystal" | "Liquid" | "Heavy" | "Frost";

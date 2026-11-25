import type { Theme } from "./types";

/**
 * Bundled high-detail image background for image mode.
 *
 * The files live next to this module in `backgrounds/`, so `new URL(...,
 * import.meta.url)` keeps them working both in bundlers (Vite/Rollup/Webpack)
 * and in plain ES-module setups. Copy the whole core folder (the install script
 * does) so the image files come along.
 *
 * `optical` is a 2880×1800 WebP pair with light and dark variants. It contains
 * no background grid, no dot screen, no labels and no color bars — only the
 * rings, spokes and registration marks.
 */
export type BackgroundImageId = "optical";

export type BackgroundImagePreset = {
  id: BackgroundImageId;
  label: string;
  note: string;
  light: string;
  dark: string;
};

const opticalLight = new URL("./backgrounds/optical-light.webp", import.meta.url).href;
const opticalDark = new URL("./backgrounds/optical-dark.webp", import.meta.url).href;

export const BACKGROUND_IMAGE_PRESETS: BackgroundImagePreset[] = [
  {
    id: "optical",
    label: "Optical Chart",
    note: "rings, spokes, registration marks",
    light: opticalLight,
    dark: opticalDark,
  },
];

export const BACKGROUND_IMAGE_IDS = BACKGROUND_IMAGE_PRESETS.map(
  (preset) => preset.id,
);

const presetMap = new Map(
  BACKGROUND_IMAGE_PRESETS.map((preset) => [preset.id, preset]),
);

export function getBackgroundImagePreset(id: BackgroundImageId) {
  return presetMap.get(id) ?? BACKGROUND_IMAGE_PRESETS[0];
}

/** Resolve the theme-specific URL for a bundled image preset. */
export function backgroundImageFor(id: BackgroundImageId, theme: Theme) {
  return getBackgroundImagePreset(id)[theme];
}

export function isBackgroundImageId(value: unknown): value is BackgroundImageId {
  return typeof value === "string" && presetMap.has(value as BackgroundImageId);
}

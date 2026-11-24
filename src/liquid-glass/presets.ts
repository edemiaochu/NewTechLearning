import type { GlassParams, PresetName } from "./types";

export const PRESETS: Record<PresetName, GlassParams> = {
  Crystal: { ior: 1.38, thickness: 30, dispersion: 0.08, roughness: 0.02, bevel: 26 },
  Liquid: { ior: 1.55, thickness: 84, dispersion: 0.4, roughness: 0.06, bevel: 4 },
  Heavy: { ior: 1.74, thickness: 84, dispersion: 0.56, roughness: 0.18, bevel: 42 },
  Frost: { ior: 1.44, thickness: 64, dispersion: 0.18, roughness: 0.6, bevel: 40 },
};

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

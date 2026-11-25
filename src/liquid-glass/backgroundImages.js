const opticalLight = new URL("./backgrounds/optical-light.webp", import.meta.url).href;
const opticalDark = new URL("./backgrounds/optical-dark.webp", import.meta.url).href;
export const BACKGROUND_IMAGE_PRESETS = [
    {
        id: "optical",
        label: "Optical Chart",
        note: "rings, spokes, registration marks",
        light: opticalLight,
        dark: opticalDark,
    },
];
export const BACKGROUND_IMAGE_IDS = BACKGROUND_IMAGE_PRESETS.map((preset) => preset.id);
const presetMap = new Map(BACKGROUND_IMAGE_PRESETS.map((preset) => [preset.id, preset]));
export function getBackgroundImagePreset(id) {
    return presetMap.get(id) ?? BACKGROUND_IMAGE_PRESETS[0];
}
/** Resolve the theme-specific URL for a bundled image preset. */
export function backgroundImageFor(id, theme) {
    return getBackgroundImagePreset(id)[theme];
}
export function isBackgroundImageId(value) {
    return typeof value === "string" && presetMap.has(value);
}

/** Resolved defaults for every GlassStyle option. */
export const DEFAULT_GLASS_STYLE = {
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
export function resolveGlassStyle(style = {}) {
    const resolved = { ...DEFAULT_GLASS_STYLE };
    for (const key of Object.keys(DEFAULT_GLASS_STYLE)) {
        const value = style[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            resolved[key] = value;
        }
    }
    return resolved;
}

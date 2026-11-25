/**
 * Framework-agnostic API.
 *
 * The renderer, shaders and registry have no framework dependency. These
 * helpers are enough to use the material from plain TypeScript/JavaScript,
 * Vue, Svelte, Astro or a custom element wrapper.
 *
 * One page should still mount ONE canvas and use ONE registry. The React
 * wrappers in this folder use the same registry.
 */
import { GlassRenderer } from "./renderer.js";
import { glassRegistry } from "./registry.js";
import { backgroundImageFor, } from "./backgroundImages.js";
/**
 * Starts the WebGL renderer. Returns null if WebGL2 is unavailable; in that
 * case the `lg-no-webgl` class is set so `core.css` can provide a fallback.
 * Call `destroy()` on page/route teardown.
 */
export function createLiquidGlass({ canvas, params, theme, background = "clean", backgroundImage, backgroundImagePreset = null, backgroundColor, backgroundAnimation = false, onError, }) {
    const addedCanvasClass = !canvas.classList.contains("lg-canvas");
    if (addedCanvasClass)
        canvas.classList.add("lg-canvas");
    try {
        const renderer = new GlassRenderer(canvas, glassRegistry);
        renderer.setParams(params);
        renderer.setTheme(theme, true);
        renderer.setBackground(background);
        renderer.setBackgroundImage(backgroundImage ?? null);
        if (backgroundColor)
            renderer.setBackgroundColor(backgroundColor);
        renderer.setBackgroundAnimation(backgroundAnimation);
        let destroyed = false;
        let currentTheme = theme;
        let imagePreset = backgroundImagePreset;
        const applyImagePreset = () => {
            if (destroyed || !imagePreset)
                return;
            renderer.setBackgroundImage(backgroundImageFor(imagePreset, currentTheme));
            renderer.setBackground("image");
        };
        applyImagePreset();
        renderer.start();
        return {
            setParams(next) {
                if (!destroyed)
                    renderer.setParams(next);
            },
            setTheme(next, immediate = false) {
                if (destroyed)
                    return;
                currentTheme = next;
                renderer.setTheme(next, immediate);
                applyImagePreset();
            },
            setBackground(mode) {
                if (destroyed)
                    return;
                renderer.setBackground(mode);
                if (mode === "image")
                    applyImagePreset();
            },
            setBackgroundImage(source) {
                if (destroyed)
                    return;
                imagePreset = null;
                renderer.setBackgroundImage(source);
            },
            setBackgroundImagePreset(id) {
                if (destroyed)
                    return;
                imagePreset = id;
                applyImagePreset();
            },
            setBackgroundColor(color) {
                if (!destroyed)
                    renderer.setBackgroundColor(color);
            },
            setBackgroundAnimation(enabled) {
                if (!destroyed)
                    renderer.setBackgroundAnimation(enabled);
            },
            destroy() {
                if (destroyed)
                    return;
                destroyed = true;
                renderer.dispose();
                if (addedCanvasClass)
                    canvas.classList.remove("lg-canvas");
                document.documentElement.classList.remove("lg-no-webgl");
            },
        };
    }
    catch (error) {
        if (addedCanvasClass)
            canvas.classList.remove("lg-canvas");
        const resolved = error instanceof Error ? error : new Error(String(error));
        document.documentElement.classList.add("lg-no-webgl");
        onError?.(resolved);
        return null;
    }
}
let surfaceId = 0;
/**
 * Registers a normal DOM element as a glass surface and wires hover/press/focus.
 *
 *   <button class="my-pill" data-...>Save</button>
 *
 *   const detach = attachGlassSurface(button, {
 *     radius: "capsule",
 *     layer: 2,
 *     interactive: true,
 *     tint: "#2E38D6",
 *     tintOpacity: 0.68,
 *   });
 *
 * The element's children remain normal DOM and stay crisp above the canvas.
 */
export function attachGlassSurface(element, options = {}) {
    const { className, id = `lg-surface-${++surfaceId}`, ...config } = options;
    const interactive = Boolean(config.interactive);
    const addedClasses = [];
    if (!element.classList.contains("lg-surface")) {
        element.classList.add("lg-surface");
        addedClasses.push("lg-surface");
    }
    if (interactive && !element.classList.contains("lg-surface--interactive")) {
        element.classList.add("lg-surface--interactive");
        addedClasses.push("lg-surface--interactive");
    }
    if (className) {
        for (const name of className.split(/\s+/).filter(Boolean)) {
            if (!element.classList.contains(name)) {
                element.classList.add(name);
                addedClasses.push(name);
            }
        }
    }
    const unregister = glassRegistry.register(id, element, config);
    const onEnter = () => glassRegistry.setHover(id, true);
    const onLeave = () => {
        glassRegistry.setHover(id, false);
        glassRegistry.setPress(id, false);
    };
    const onDown = () => glassRegistry.setPress(id, true);
    const onUp = () => glassRegistry.setPress(id, false);
    const onFocus = () => glassRegistry.setHover(id, true);
    const onBlur = () => {
        glassRegistry.setHover(id, false);
        glassRegistry.setPress(id, false);
    };
    if (interactive) {
        element.addEventListener("pointerenter", onEnter);
        element.addEventListener("pointerleave", onLeave);
        element.addEventListener("pointerdown", onDown);
        element.addEventListener("pointerup", onUp);
        element.addEventListener("pointercancel", onUp);
        element.addEventListener("focus", onFocus);
        element.addEventListener("blur", onBlur);
    }
    return () => {
        if (interactive) {
            element.removeEventListener("pointerenter", onEnter);
            element.removeEventListener("pointerleave", onLeave);
            element.removeEventListener("pointerdown", onDown);
            element.removeEventListener("pointerup", onUp);
            element.removeEventListener("pointercancel", onUp);
            element.removeEventListener("focus", onFocus);
            element.removeEventListener("blur", onBlur);
        }
        unregister();
        for (const name of addedClasses)
            element.classList.remove(name);
    };
}
function attrNumber(value, fallback) {
    if (value === undefined || value === "")
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function attrRadius(value) {
    if (value === "capsule" || value === "circle")
        return value;
    if (value === undefined || value === "")
        return 20;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 20;
}
const hydrated = new WeakSet();
/**
 * Optional declarative path for static HTML:
 *
 *   <div class="card" data-lg-surface
 *        data-lg-radius="28"
 *        data-lg-layer="1"
 *        data-lg-tint-opacity="0.06">
 *     ...
 *   </div>
 *
 * Call once after the DOM is ready. Returns a cleanup function.
 */
export function hydrateGlassSurfaces(root = document) {
    const cleanups = [];
    root.querySelectorAll("[data-lg-surface]").forEach((element) => {
        if (hydrated.has(element))
            return;
        hydrated.add(element);
        const cleanup = attachGlassSurface(element, {
            radius: attrRadius(element.dataset.lgRadius),
            layer: attrNumber(element.dataset.lgLayer, 1),
            tint: element.dataset.lgTint ?? "#ffffff",
            tintOpacity: attrNumber(element.dataset.lgTintOpacity, 0.12),
            bevelScale: attrNumber(element.dataset.lgBevelScale, 1),
            thicknessScale: attrNumber(element.dataset.lgThicknessScale, 1),
            refractionScale: attrNumber(element.dataset.lgRefractionScale, 1),
            interactive: element.hasAttribute("data-lg-interactive"),
            className: element.dataset.lgClass,
        });
        cleanups.push(() => {
            cleanup();
            hydrated.delete(element);
        });
    });
    return () => {
        for (const cleanup of cleanups)
            cleanup();
        cleanups.length = 0;
    };
}

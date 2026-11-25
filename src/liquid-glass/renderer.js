import { BACKGROUND_FRAG, FULLSCREEN_VERT, GLASS_FRAG, IMAGE_BACKGROUND_FRAG } from "./shaders.js";
import { resolveGlassStyle } from "./types.js";
const MAX_SHAPES = 32;
function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader)
        throw new Error("Unable to allocate a WebGL shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compilation failed: ${log}`);
    }
    return shader;
}
function createProgram(gl, fragmentSource) {
    const vertex = compileShader(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program)
        throw new Error("Unable to allocate a WebGL program.");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Program link failed: ${log}`);
    }
    const uniforms = new Map();
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i);
        if (!info)
            continue;
        // Array uniforms are reported as "name[0]"; store the bare name too so
        // uploads can look up whole arrays without caring about the first index.
        const name = info.name.replace(/\[0\]$/, "");
        uniforms.set(name, gl.getUniformLocation(program, info.name));
        uniforms.set(info.name, uniforms.get(name) ?? null);
    }
    return { program, uniforms };
}
/**
 * Two-pass renderer:
 *   1. an animated optical environment into a mipmapped framebuffer;
 *   2. the glass composite, which samples and bends that environment.
 */
export class GlassRenderer {
    constructor(canvas, registry) {
        this.fbo = null;
        this.bgTexture = null;
        this.imageTexture = null;
        this.imageAspect = 1;
        this.hasImage = false;
        this.imageLoadToken = 0;
        this.width = 1;
        this.height = 1;
        this.dpr = 1;
        this.maxLod = 0;
        this.params = {
            ior: 1.55,
            thickness: 52,
            dispersion: 0.4,
            roughness: 0.06,
            bevel: 36,
        };
        this.style = resolveGlassStyle();
        this.theme = 1;
        this.themeTarget = 1;
        this.backgroundMode = "clean";
        this.solidColor = [0.86, 0.894, 0.949];
        this.pointer = { x: 0, y: 0 };
        this.pointerTarget = { x: 0, y: 0 };
        this.time = 0;
        this.lastFrame = 0;
        this.raf = 0;
        this.disposed = false;
        this.reducedMotion = false;
        this.motionQuery = null;
        this.backgroundAnimation = false;
        this.rectData = new Float32Array(MAX_SHAPES * 4);
        this.propsData = new Float32Array(MAX_SHAPES * 4);
        this.tintData = new Float32Array(MAX_SHAPES * 4);
        this.extraData = new Float32Array(MAX_SHAPES * 4);
        this.handlePointer = (event) => {
            this.pointerTarget.x = event.clientX;
            this.pointerTarget.y = event.clientY;
        };
        this.handleVisibility = () => {
            this.lastFrame = 0;
        };
        this.handleMotionPreference = (event) => {
            this.reducedMotion = event.matches;
        };
        this.frame = (nowMs) => {
            if (this.disposed)
                return;
            const now = nowMs / 1000;
            let dt = this.lastFrame === 0 ? 1 / 60 : now - this.lastFrame;
            dt = Math.min(Math.max(dt, 0), 0.05);
            this.lastFrame = now;
            if (this.backgroundAnimation && !this.reducedMotion)
                this.time += dt;
            const follow = 1 - Math.exp(-dt * 3.6);
            this.theme += (this.themeTarget - this.theme) * follow;
            const pointerFollow = 1 - Math.exp(-dt * 11);
            this.pointer.x += (this.pointerTarget.x - this.pointer.x) * pointerFollow;
            this.pointer.y += (this.pointerTarget.y - this.pointer.y) * pointerFollow;
            this.registry.update(dt);
            this.resizeIfNeeded();
            const shapes = this.registry.collect();
            this.render(shapes);
            this.raf = requestAnimationFrame(this.frame);
        };
        this.canvas = canvas;
        this.registry = registry;
        const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
        });
        if (!gl) {
            throw new Error("WebGL 2.0 is not available in this browser.");
        }
        this.gl = gl;
        this.background = createProgram(gl, BACKGROUND_FRAG);
        this.imageBackground = createProgram(gl, IMAGE_BACKGROUND_FRAG);
        this.glass = createProgram(gl, GLASS_FRAG);
        this.vao = gl.createVertexArray();
        this.pointer = {
            x: window.innerWidth * 0.16,
            y: window.innerHeight * 0.3,
        };
        this.pointerTarget = { ...this.pointer };
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        if (typeof window.matchMedia === "function") {
            this.motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
            this.reducedMotion = this.motionQuery.matches;
            this.motionQuery.addEventListener("change", this.handleMotionPreference);
        }
        window.addEventListener("pointermove", this.handlePointer, { passive: true });
        document.addEventListener("visibilitychange", this.handleVisibility);
    }
    setParams(params) {
        this.params = params;
        this.style = resolveGlassStyle(params);
    }
    setTheme(theme, immediate = false) {
        this.themeTarget = theme === "light" ? 1 : 0;
        if (immediate)
            this.theme = this.themeTarget;
    }
    setBackground(mode) {
        this.backgroundMode = mode;
    }
    /**
     * Enables the slow drift of the procedural color fields. Off by default:
     * every background mode renders a static composition until this is enabled.
     * `prefers-reduced-motion: reduce` still freezes the clock.
     */
    setBackgroundAnimation(enabled) {
        this.backgroundAnimation = enabled;
    }
    /**
     * Uploads an image and stores it as the custom environment source.
     * `background` must be set to "image" for it to be displayed.
     * Remote URLs need CORS; local uploads / object URLs work directly.
     */
    /** Accepts any CSS color; used when background is "solid". */
    setBackgroundColor(color) {
        this.solidColor = this.parseCssColor(color);
    }
    parseCssColor(color) {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx)
            return [0.86, 0.894, 0.949];
        ctx.fillStyle = "#000000";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return [data[0] / 255, data[1] / 255, data[2] / 255];
    }
    setBackgroundImage(source) {
        if (source === null) {
            this.imageLoadToken++;
            this.hasImage = false;
            return;
        }
        if (typeof source === "string") {
            this.loadBackgroundImage(source);
            return;
        }
        this.imageLoadToken++;
        this.uploadBackgroundImage(source);
    }
    loadBackgroundImage(url) {
        const token = ++this.imageLoadToken;
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
            if (token !== this.imageLoadToken)
                return;
            this.uploadBackgroundImage(image);
        };
        image.onerror = () => {
            if (token !== this.imageLoadToken)
                return;
            this.hasImage = false;
            console.warn("[liquid-glass] Could not load background image:", url);
        };
        image.src = url;
    }
    uploadBackgroundImage(source) {
        const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
        const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
        if (!width || !height)
            return;
        const gl = this.gl;
        if (!this.imageTexture) {
            this.imageTexture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        }
        gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
            this.imageAspect = width / height;
            this.hasImage = true;
        }
        catch (error) {
            this.hasImage = false;
            console.warn("[liquid-glass] Could not upload background image", error);
        }
    }
    start() {
        if (this.disposed)
            return;
        this.raf = requestAnimationFrame(this.frame);
    }
    resizeIfNeeded() {
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.max(1, this.canvas.clientWidth);
        const cssH = Math.max(1, this.canvas.clientHeight);
        const maxPixels = 4500000;
        const pixels = cssW * cssH * dpr * dpr;
        if (pixels > maxPixels)
            dpr *= Math.sqrt(maxPixels / pixels);
        const width = Math.max(1, Math.round(cssW * dpr));
        const height = Math.max(1, Math.round(cssH * dpr));
        if (width === this.width && height === this.height && dpr === this.dpr && this.fbo) {
            return;
        }
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.canvas.width = width;
        this.canvas.height = height;
        this.maxLod = Math.max(0, Math.log2(Math.max(width, height)) - 1);
        const gl = this.gl;
        if (this.bgTexture)
            gl.deleteTexture(this.bgTexture);
        if (this.fbo)
            gl.deleteFramebuffer(this.fbo);
        this.bgTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bgTexture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    render(shapes) {
        const gl = this.gl;
        const { width, height } = this;
        if (!this.fbo || !this.bgTexture)
            return;
        gl.bindVertexArray(this.vao);
        // ---- pass 1: background environment -----------------------------------
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, width, height);
        if (this.backgroundMode === "image" && this.hasImage && this.imageTexture) {
            gl.useProgram(this.imageBackground.program);
            this.uniform1f(this.imageBackground, "uDpr", this.dpr);
            this.uniform2f(this.imageBackground, "uRes", width, height);
            this.uniform1f(this.imageBackground, "uTheme", this.theme);
            this.uniform1f(this.imageBackground, "uImageAspect", this.imageAspect);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
            gl.uniform1i(this.imageBackground.uniforms.get("uImage") ?? null, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        else {
            gl.useProgram(this.background.program);
            this.uniform1f(this.background, "uDpr", this.dpr);
            this.uniform2f(this.background, "uRes", width, height);
            this.uniform1f(this.background, "uTime", this.time);
            this.uniform1f(this.background, "uTheme", this.theme);
            this.uniform1f(this.background, "uBackgroundMode", this.backgroundMode === "specimen"
                ? 1
                : this.backgroundMode === "solid"
                    ? 2
                    : 0);
            this.uniform3f(this.background, "uSolidColor", this.solidColor[0], this.solidColor[1], this.solidColor[2]);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
        gl.generateMipmap(gl.TEXTURE_2D);
        // ---- pass 2: glass -----------------------------------------------------
        const shapeCount = Math.min(shapes.length, MAX_SHAPES);
        for (let i = 0; i < MAX_SHAPES; i++) {
            const offset = i * 4;
            const shape = i < shapeCount ? shapes[i] : null;
            if (!shape) {
                this.rectData.fill(0, offset, offset + 4);
                this.propsData.fill(0, offset, offset + 4);
                this.tintData.fill(0, offset, offset + 4);
                this.extraData.fill(0, offset, offset + 4);
                continue;
            }
            const bevel = Math.min(this.params.bevel * shape.bevelScale, Math.min(shape.w, shape.h) * 0.46);
            this.rectData[offset] = shape.x;
            this.rectData[offset + 1] = shape.y;
            this.rectData[offset + 2] = shape.w;
            this.rectData[offset + 3] = shape.h;
            this.propsData[offset] = shape.radius;
            this.propsData[offset + 1] = bevel;
            this.propsData[offset + 2] = shape.hover;
            this.propsData[offset + 3] = shape.press;
            this.tintData[offset] = shape.tint[0];
            this.tintData[offset + 1] = shape.tint[1];
            this.tintData[offset + 2] = shape.tint[2];
            this.tintData[offset + 3] = shape.tintOpacity;
            this.extraData[offset] = shape.thicknessScale;
            this.extraData[offset + 1] = shape.refractionScale;
            this.extraData[offset + 2] = 0;
            this.extraData[offset + 3] = 0;
        }
        gl.viewport(0, 0, width, height);
        gl.useProgram(this.glass.program);
        this.uniform1f(this.glass, "uDpr", this.dpr);
        this.uniform2f(this.glass, "uRes", width, height);
        this.uniform1f(this.glass, "uTime", this.time);
        this.uniform1f(this.glass, "uTheme", this.theme);
        this.uniform2f(this.glass, "uPointer", this.pointer.x, this.pointer.y);
        this.uniform1f(this.glass, "uMaxLod", this.maxLod);
        this.uniform1f(this.glass, "uIor", this.params.ior);
        this.uniform1f(this.glass, "uThickness", this.params.thickness);
        this.uniform1f(this.glass, "uDispersion", this.params.dispersion);
        this.uniform1f(this.glass, "uRoughness", this.params.roughness);
        this.uniform1f(this.glass, "uBevel", this.params.bevel);
        this.uniform1f(this.glass, "uShadowLight", this.style.shadowLight);
        this.uniform1f(this.glass, "uShadowDark", this.style.shadowDark);
        this.uniform1f(this.glass, "uShadowSoftness", this.style.shadowSoftness);
        this.uniform2f(this.glass, "uShadowOffset", this.style.shadowOffsetX, this.style.shadowOffsetY);
        this.uniform1f(this.glass, "uRimWidth", this.style.rimWidth);
        this.uniform1f(this.glass, "uRimBase", this.style.rimBase);
        this.uniform1f(this.glass, "uRimFacing", this.style.rimFacing);
        this.uniform1f(this.glass, "uRimTop", this.style.rimTop);
        this.uniform1f(this.glass, "uRimStrength", this.style.rimStrength);
        this.uniform1f(this.glass, "uSpecularStrength", this.style.specularStrength);
        this.uniform1f(this.glass, "uFresnelStrength", this.style.fresnelStrength);
        this.uniform1f(this.glass, "uInnerGlowStrength", this.style.innerGlowStrength);
        this.uniform1i(this.glass, "uShapeCount", shapeCount);
        this.uniform4fv(this.glass, "uRect", this.rectData);
        this.uniform4fv(this.glass, "uProps", this.propsData);
        this.uniform4fv(this.glass, "uTint", this.tintData);
        this.uniform4fv(this.glass, "uExtra", this.extraData);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.bgTexture);
        gl.uniform1i(this.glass.uniforms.get("uBg") ?? null, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    uniform1f(info, name, value) {
        const location = info.uniforms.get(name);
        if (location)
            this.gl.uniform1f(location, value);
    }
    uniform2f(info, name, x, y) {
        const location = info.uniforms.get(name);
        if (location)
            this.gl.uniform2f(location, x, y);
    }
    uniform3f(info, name, x, y, z) {
        const location = info.uniforms.get(name);
        if (location)
            this.gl.uniform3f(location, x, y, z);
    }
    uniform1i(info, name, value) {
        const location = info.uniforms.get(name);
        if (location)
            this.gl.uniform1i(location, value);
    }
    uniform4fv(info, name, data) {
        const location = info.uniforms.get(name);
        if (location)
            this.gl.uniform4fv(location, data);
    }
    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.raf);
        window.removeEventListener("pointermove", this.handlePointer);
        document.removeEventListener("visibilitychange", this.handleVisibility);
        this.motionQuery?.removeEventListener("change", this.handleMotionPreference);
        const gl = this.gl;
        if (this.bgTexture)
            gl.deleteTexture(this.bgTexture);
        if (this.imageTexture)
            gl.deleteTexture(this.imageTexture);
        if (this.fbo)
            gl.deleteFramebuffer(this.fbo);
        if (this.vao)
            gl.deleteVertexArray(this.vao);
        gl.deleteProgram(this.background.program);
        gl.deleteProgram(this.imageBackground.program);
        gl.deleteProgram(this.glass.program);
    }
}

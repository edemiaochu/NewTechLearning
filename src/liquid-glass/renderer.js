import { BACKGROUND_FRAG, FULLSCREEN_VERT, GLASS_FRAG, IMAGE_BACKGROUND_FRAG } from "./shaders.js";
const MAX_SHAPES = 40;
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
    canvas;
    gl;
    registry;
    background;
    imageBackground;
    glass;
    vao;
    fbo = null;
    bgTexture = null;
    imageTexture = null;
    imageAspect = 1;
    hasImage = false;
    imageLoadToken = 0;
    width = 1;
    height = 1;
    dpr = 1;
    maxLod = 0;
    params = {
        ior: 1.55,
        thickness: 52,
        dispersion: 0.4,
        roughness: 0.06,
        bevel: 36,
    };
    palette = {
        baseTop: [0.977, 0.963, 0.944],
        baseBot: [0.902, 0.931, 0.966],
        blobA: [0.94, 0.2, 0.42],
        blobB: [0.35, 0.24, 0.95],
        blobC: [0.1, 0.72, 0.92],
        blobD: [0.1, 0.82, 0.65],
        blobE: [1.0, 0.55, 0.16],
        stageGlow: [0.52, 0.42, 1.0],
        cornerGlow: [0.28, 0.52, 1.0],
        ink: [0.075, 0.08, 0.11],
        blobStrength: 0.46,
    };
    theme = 1;
    themeTarget = 1;
    backgroundMode = "clean";
    solidColor = [0.86, 0.894, 0.949];
    pointer = { x: 0, y: 0 };
    pointerTarget = { x: 0, y: 0 };
    time = 0;
    lastFrame = 0;
    raf = 0;
    disposed = false;
    rectData = new Float32Array(MAX_SHAPES * 4);
    propsData = new Float32Array(MAX_SHAPES * 4);
    tintData = new Float32Array(MAX_SHAPES * 4);
    extraData = new Float32Array(MAX_SHAPES * 4);
    handlePointer = (event) => {
        this.pointerTarget.x = event.clientX;
        this.pointerTarget.y = event.clientY;
    };
    handleVisibility = () => {
        this.lastFrame = 0;
    };
    constructor(canvas, registry) {
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
        window.addEventListener("pointermove", this.handlePointer, { passive: true });
        document.addEventListener("visibilitychange", this.handleVisibility);
    }
    setParams(params) {
        this.params = params;
    }
    /** Replaces the procedural environment palette (host design tokens). */
    setPalette(palette) {
        this.palette = palette;
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
    frame = (nowMs) => {
        if (this.disposed)
            return;
        const now = nowMs / 1000;
        let dt = this.lastFrame === 0 ? 1 / 60 : now - this.lastFrame;
        dt = Math.min(Math.max(dt, 0), 0.05);
        this.lastFrame = now;
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
    resizeIfNeeded() {
        let dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.max(1, this.canvas.clientWidth);
        const cssH = Math.max(1, this.canvas.clientHeight);
        const maxPixels = 4_500_000;
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
            const p = this.palette;
            this.uniform3f(this.background, "uBaseTop", p.baseTop[0], p.baseTop[1], p.baseTop[2]);
            this.uniform3f(this.background, "uBaseBot", p.baseBot[0], p.baseBot[1], p.baseBot[2]);
            this.uniform3f(this.background, "uBlobA", p.blobA[0], p.blobA[1], p.blobA[2]);
            this.uniform3f(this.background, "uBlobB", p.blobB[0], p.blobB[1], p.blobB[2]);
            this.uniform3f(this.background, "uBlobC", p.blobC[0], p.blobC[1], p.blobC[2]);
            this.uniform3f(this.background, "uBlobD", p.blobD[0], p.blobD[1], p.blobD[2]);
            this.uniform3f(this.background, "uBlobE", p.blobE[0], p.blobE[1], p.blobE[2]);
            this.uniform3f(this.background, "uStageGlow", p.stageGlow[0], p.stageGlow[1], p.stageGlow[2]);
            this.uniform3f(this.background, "uCornerGlow", p.cornerGlow[0], p.cornerGlow[1], p.cornerGlow[2]);
            this.uniform3f(this.background, "uInk", p.ink[0], p.ink[1], p.ink[2]);
            this.uniform1f(this.background, "uBlobStrength", p.blobStrength);
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

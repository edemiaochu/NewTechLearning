/**
 * Registers DOM elements as glass surfaces. Geometry is measured from the DOM
 * every frame, so the WebGL glass always sits exactly behind its real content.
 */

export type GlassRadius = number | "capsule" | "circle";

export type GlassConfig = {
  radius?: GlassRadius;
  /** Base tint, hex string. The shader derives a dark-theme variant. */
  tint?: string;
  tintOpacity?: number;
  bevelScale?: number;
  thicknessScale?: number;
  refractionScale?: number;
  interactive?: boolean;
  layer?: number;
  /** Optional scroll/viewport container; the shape is intersected with it. */
  clip?: HTMLElement;
};

export type FrameShape = {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  bevelScale: number;
  thicknessScale: number;
  refractionScale: number;
  tint: [number, number, number];
  tintOpacity: number;
  hover: number;
  press: number;
  layer: number;
};

type Registration = {
  el: HTMLElement;
  config: GlassConfig;
  tint: [number, number, number];
  hover: number;
  hoverTarget: number;
  press: number;
  pressTarget: number;
  order: number;
};

const tintCache = new Map<string, [number, number, number]>();

function parseTint(hex: string): [number, number, number] {
  const cached = tintCache.get(hex);
  if (cached) return cached;

  let value = hex.replace("#", "").trim();
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = Number.parseInt(value || "ffffff", 16);
  const rgb: [number, number, number] = [
    ((int >> 16) & 255) / 255,
    ((int >> 8) & 255) / 255,
    (int & 255) / 255,
  ];
  tintCache.set(hex, rgb);
  return rgb;
}

export class GlassRegistry {
  private items = new Map<string, Registration>();
  private sequence = 0;

  register(id: string, el: HTMLElement, config: GlassConfig = {}) {
    this.items.set(id, {
      el,
      config,
      tint: parseTint(config.tint ?? "#ffffff"),
      hover: 0,
      hoverTarget: 0,
      press: 0,
      pressTarget: 0,
      order: this.sequence++,
    });

    return () => {
      this.items.delete(id);
    };
  }

  setHover(id: string, hover: boolean) {
    const item = this.items.get(id);
    if (!item) return;
    item.hoverTarget = hover ? 1 : 0;
  }

  setPress(id: string, press: boolean) {
    const item = this.items.get(id);
    if (!item) return;
    item.pressTarget = press ? 1 : 0;
  }

  update(dt: number) {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 13);
    for (const item of this.items.values()) {
      item.hover += (item.hoverTarget - item.hover) * k;
      item.press += (item.pressTarget - item.press) * k;
    }
  }

  collect(): FrameShape[] {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const shapes: FrameShape[] = [];

    for (const item of this.items.values()) {
      const r = item.el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < -120 || r.top > vh + 120 || r.right < -120 || r.left > vw + 120) {
        continue;
      }

      // Shapes are not clipped by DOM overflow, so honour an explicit scroll /
      // viewport container (e.g. rows inside the scrollable sidebar).
      let left = r.left;
      let top = r.top;
      let right = r.right;
      let bottom = r.bottom;
      if (item.config.clip) {
        const c = item.config.clip.getBoundingClientRect();
        left = Math.max(left, c.left);
        top = Math.max(top, c.top);
        right = Math.min(right, c.right);
        bottom = Math.min(bottom, c.bottom);
      }

      const width = right - left;
      const height = bottom - top;
      if (width < 2 || height < 2) continue;

      const radiusConfig = item.config.radius ?? 20;
      let radius: number;
      if (radiusConfig === "capsule" || radiusConfig === "circle") {
        radius = Math.min(width, height) / 2;
      } else {
        radius = radiusConfig;
      }
      radius = Math.min(radius, Math.min(width, height) / 2);

      shapes.push({
        x: left,
        y: top,
        w: width,
        h: height,
        radius,
        bevelScale: item.config.bevelScale ?? 1,
        thicknessScale: item.config.thicknessScale ?? 1,
        refractionScale: item.config.refractionScale ?? 1,
        tint: item.tint,
        tintOpacity: item.config.tintOpacity ?? 0.12,
        hover: item.hover,
        press: item.press,
        layer: item.config.layer ?? 1,
      });
    }

    shapes.sort((a, b) => a.layer - b.layer);
    return shapes;
  }
}

export const glassRegistry = new GlassRegistry();

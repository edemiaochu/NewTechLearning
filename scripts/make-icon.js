/**
 * Generates build/icon.png (256×256) and build/icon.ico without any
 * image dependencies. Run with: node scripts/make-icon.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const SS = 2; // supersampling factor
const W = SIZE * SS;

const PURPLE = [124, 58, 237];
const CYAN = [14, 165, 233];
const DARK = [16, 18, 27];
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function roundedRectAlpha(x, y) {
  const cx = W / 2;
  const cy = W / 2;
  const half = W / 2 - 8 * SS;
  const radius = 58 * SS;
  const dx = Math.max(Math.abs(x - cx) - (half - radius), 0);
  const dy = Math.max(Math.abs(y - cy) - (half - radius), 0);
  const dist = Math.sqrt(dx * dx + dy * dy) - radius;
  return 1 - smoothstep(-1.5 * SS, 0.5 * SS, dist);
}

function render() {
  const hi = Buffer.alloc(W * W * 4);
  const cx = W / 2;
  const cy = W / 2;
  const rings = [48, 82, 114].map((r) => r * SS);

  for (let y = 0; y < W; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const idx = (y * W + x) * 4;
      const alpha = roundedRectAlpha(x, y);
      if (alpha <= 0.001) {
        hi[idx + 3] = 0;
        continue;
      }

      const nx = (x - cx) / (W / 2);
      const ny = (y - cy) / (W / 2);
      const t = clamp01((nx + ny + 2) / 4);
      let color = mix(PURPLE, CYAN, t);

      // Darken the lower-right corner slightly for depth.
      const vignette = clamp01(Math.sqrt(nx * nx + ny * ny) * 0.72);
      color = mix(color, DARK, vignette * 0.22);

      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      // Concentric radar rings.
      let ring = 0;
      for (const r of rings) {
        const d = Math.abs(dist - r);
        ring += Math.exp(-(d * d) / (2 * (1.6 * SS) ** 2));
      }
      ring = clamp01(ring);

      // Radar sweep: a soft wedge pointing to the upper-right.
      const angle = Math.atan2(y - cy, x - cx);
      const sweepCenter = -Math.PI / 4;
      let delta = angle - sweepCenter;
      while (delta < -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      const sweep = Math.exp(-(delta * delta) / (2 * 0.20 ** 2)) * smoothstep(0, 20 * SS, dist);

      // Crosshair lines.
      const lineX = Math.exp(-((x - cx) ** 2) / (2 * (1.3 * SS) ** 2));
      const lineY = Math.exp(-((y - cy) ** 2) / (2 * (1.3 * SS) ** 2));
      const cross = (lineX + lineY) * 0.35;

      // Center dot.
      const dot = 1 - smoothstep(6 * SS, 8 * SS, dist);

      const light = clamp01(ring * 0.5 + sweep * 0.55 + cross * 0.5 + dot);
      color = mix(color, WHITE, light);

      hi[idx] = Math.round(color[0]);
      hi[idx + 1] = Math.round(color[1]);
      hi[idx + 2] = Math.round(color[2]);
      hi[idx + 3] = Math.round(alpha * 255);
    }
  }

  // Box-filter down to the final size.
  const out = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
          const alpha = hi[i + 3] / 255;
          r += hi[i] * alpha;
          g += hi[i + 1] * alpha;
          b += hi[i + 2] * alpha;
          a += hi[i + 3];
        }
      }
      const count = SS * SS;
      const o = (y * SIZE + x) * 4;
      const alpha = a / count;
      if (alpha > 0) {
        out[o] = Math.round(r / (count * (alpha / 255)));
        out[o + 1] = Math.round(g / (count * (alpha / 255)));
        out[o + 2] = Math.round(b / (count * (alpha / 255)));
      }
      out[o + 3] = Math.round(alpha);
    }
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * (SIZE * 4 + 1)] = 0;
    pixels.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function encodeIco(png) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 0; // 256px
  header[7] = 0;
  header[8] = 0;
  header[9] = 0;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const pixels = render();
const png = encodePng(pixels);
fs.writeFileSync(path.join(outDir, 'icon.png'), png);
fs.writeFileSync(path.join(outDir, 'icon.ico'), encodeIco(png));
console.log(`Wrote build/icon.png (${png.length} bytes) and build/icon.ico`);

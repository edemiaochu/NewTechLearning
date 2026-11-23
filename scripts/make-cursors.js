/**
 * Generates the custom pen cursor (32×32 PNG) with transparency.
 * Run with: node scripts/make-cursors.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const SIZE = 32;
const SS = 4;
const W = SIZE * SS;

function distToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

function pointInTriangle(px, py, a, b, c) {
  const sign = (p1x, p1y, p2x, p2y, p3x, p3y) =>
    (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
  const d1 = sign(px, py, a[0], a[1], b[0], b[1]);
  const d2 = sign(px, py, b[0], b[1], c[0], c[1]);
  const d3 = sign(px, py, c[0], c[1], a[0], a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function penPixel(px, py) {
  const outline = distToSegment(px, py, 25, 6, 9, 22) <= 3.9;
  const body = distToSegment(px, py, 25, 6, 9, 22) <= 2.7;
  const tip = pointInTriangle(px, py, [10, 21.5], [2.5, 29.5], [14, 25]);
  const cap = distToSegment(px, py, 24, 4.5, 27, 7.5) <= 1.7;

  if (tip || cap) return [17, 24, 39, 255];
  if (body) return [248, 250, 252, 255];
  if (outline) return [17, 24, 39, 255];
  return [0, 0, 0, 0];
}

function renderPen(size) {
  const scale = size / 32;
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      // Supersample for smooth vector edges.
      const samples = 4;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) / scale;
          const py = (y + (sy + 0.5) / samples) / scale;
          const [cr, cg, cb, ca] = penPixel(px, py);
          const alpha = ca / 255;
          r += cr * alpha;
          g += cg * alpha;
          b += cb * alpha;
          a += ca;
        }
      }
      const count = samples * samples;
      const o = (y * size + x) * 4;
      const alpha = a / count;
      if (alpha > 0) {
        const factor = count * (alpha / 255);
        pixels[o] = Math.round(r / factor);
        pixels[o + 1] = Math.round(g / factor);
        pixels[o + 2] = Math.round(b / factor);
      }
      pixels[o + 3] = Math.round(alpha);
    }
  }
  return pixels;
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

function encodePng(pixels, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = path.join(__dirname, '..', 'src', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const cursor = encodePng(renderPen(SIZE), SIZE);
fs.writeFileSync(path.join(outDir, 'pen-cursor.png'), cursor);
console.log(`Wrote src/assets/pen-cursor.png (${cursor.length} bytes)`);

// Optional large preview for design review; not used by the app.
if (process.argv.includes('--preview')) {
  const preview = encodePng(renderPen(160), 160);
  const previewPath = path.join(os.tmpdir(), 'pen-cursor-preview.png');
  fs.writeFileSync(previewPath, preview);
  console.log(`Wrote preview ${previewPath}`);
}

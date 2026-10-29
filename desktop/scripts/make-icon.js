// Generates desktop/build/icon.png — a clean brand "chat bubble" app icon —
// with zero dependencies (manual PNG encoding). Run: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 256;

// ── tiny geometry helpers ──
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function insideRoundRect(x, y, x1, y1, x2, y2, r) {
  if (x < x1 || x > x2 || y < y1 || y > y2) return false;
  const cx = clamp(x, x1 + r, x2 - r);
  const cy = clamp(y, y1 + r, y2 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function insideTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) =>
    (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1]);
  const d1 = sign([px, py], a, b);
  const d2 = sign([px, py], b, c);
  const d3 = sign([px, py], c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// ── paint RGBA ──
const buf = Buffer.alloc(N * N * 4, 0);
function px(x, y, r, g, b, a = 255) {
  const i = (y * N + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

// brand gradient: rose (#f43f5e) → orange (#fb923c)
const c0 = [0xf4, 0x3f, 0x5e];
const c1 = [0xfb, 0x92, 0x3c];
const DOT = [0xf4, 0x3f, 0x5e];

for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    if (!insideRoundRect(x, y, 0, 0, N - 1, N - 1, 56)) continue;
    const t = y / N;
    px(x, y, Math.round(lerp(c0[0], c1[0], t)), Math.round(lerp(c0[1], c1[1], t)), Math.round(lerp(c0[2], c1[2], t)));
  }
}

// white speech bubble + tail
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    const bubble = insideRoundRect(x, y, 52, 60, 204, 162, 34);
    const tail = insideTriangle(x, y, [92, 158], [140, 158], [86, 200]);
    if (bubble || tail) px(x, y, 255, 255, 255);
  }
}

// three brand dots inside the bubble
for (const cx of [100, 128, 156]) {
  for (let y = -14; y <= 14; y++) {
    for (let x = -14; x <= 14; x++) {
      if (x * x + y * y <= 13 * 13) px(cx + x, 111 + y, DOT[0], DOT[1], DOT[2]);
    }
  }
}

// ── encode PNG ──
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type RGBA
// 10,11,12 = compression/filter/interlace = 0

const raw = Buffer.alloc(N * (N * 4 + 1));
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0; // filter: none
  buf.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes');

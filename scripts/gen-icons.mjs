// Erzeugt die PWA-Icons (PNG) prozedural – ohne externe Abhängigkeiten.
// Aufruf: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(out, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (s) => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const PINK = hex('#ff2bd6'), CYAN = hex('#00f0ff'), VIOLET = hex('#9d4dff');

// Würfel (abgerundetes Quadrat, leicht gedreht) mit 5 Augen.
const ROT = -0.22;
function dieDist(U, V) {
  const c = Math.cos(ROT), s = Math.sin(ROT);
  const x = U * c - V * s, y = U * s + V * c;
  const k = 0.16, hs = 0.5;
  const qx = Math.max(Math.abs(x) - (hs - k), 0), qy = Math.max(Math.abs(y) - (hs - k), 0);
  const inner = Math.min(Math.max(Math.abs(x) - (hs - k), Math.abs(y) - (hs - k)), 0);
  return { d: Math.hypot(qx, qy) + inner - k, x, y };
}
const PIPS = [[0, 0], [-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]];

function render(size, scale, rounded) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const u = ((x + (sx + 0.5) / ss) / size) * 2 - 1;
          const v = ((y + (sy + 0.5) / ss) / size) * 2 - 1;
          const rr = Math.hypot(u, v);
          let c = [0.02 + 0.1 * Math.max(0, 1 - rr), 0.01 + 0.03 * Math.max(0, 1 - rr), 0.05 + 0.2 * Math.max(0, 1 - rr)];
          const gu = (u / scale) * 4, gv = (v / scale) * 4;
          const gl = Math.min(Math.abs(gu - Math.round(gu)), Math.abs(gv - Math.round(gv)));
          if (gl < 0.025) c = c.map((ch, i) => ch + VIOLET[i] * 0.12);
          const U = u / scale, V = v / scale;
          const { d, x: dx, y: dy } = dieDist(U, V);
          const edge = Math.max(0, 1 - Math.abs(d) / 0.03);
          const glow = Math.exp(-Math.abs(d) * 12) * 0.75;
          if (d < 0) c = c.map((ch, i) => ch * 0.3 + [0.07, 0.05, 0.16][i]);
          for (let i = 0; i < 3; i++) c[i] += CYAN[i] * (edge + glow);
          if (d < 0) {
            for (const [px, py] of PIPS) {
              const pd = Math.hypot(dx - px, dy - py);
              const pip = Math.max(0, 1 - Math.max(0, pd - 0.07) / 0.012);
              const pg = Math.exp(-pd * 22) * 0.9;
              for (let i = 0; i < 3; i++) c[i] += PINK[i] * (pip + pg) + pip * 0.35;
            }
          }
          let alpha = 1;
          if (rounded) {
            const k = 0.22;
            const qx = Math.max(Math.abs(u) - (1 - k), 0), qy = Math.max(Math.abs(v) - (1 - k), 0);
            const dd = Math.hypot(qx, qy) - k;
            alpha = Math.max(0, Math.min(1, -dd * size * 0.5 + 0.5));
          }
          r += Math.min(1, c[0]) * alpha;
          g += Math.min(1, c[1]) * alpha;
          b += Math.min(1, c[2]) * alpha;
          a += alpha;
        }
      const n = ss * ss;
      const o = (y * size + x) * 4;
      const A = a / n;
      buf[o] = Math.round((A ? r / a : 0) * 255);
      buf[o + 1] = Math.round((A ? g / a : 0) * 255);
      buf[o + 2] = Math.round((A ? b / a : 0) * 255);
      buf[o + 3] = Math.round(A * 255);
    }
  return png(size, size, buf);
}

writeFileSync(join(out, 'icon-192.png'), render(192, 1, true));
writeFileSync(join(out, 'icon-512.png'), render(512, 1, true));
writeFileSync(join(out, 'icon-maskable-512.png'), render(512, 0.72, false));
writeFileSync(join(out, 'apple-touch-icon.png'), render(180, 0.9, false));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2">
<defs><radialGradient id="b"><stop offset="0" stop-color="#22104a"/><stop offset="1" stop-color="#05030c"/></radialGradient>
<filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.03" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="-1" y="-1" width="2" height="2" rx="0.4" fill="url(#b)"/>
<g transform="rotate(${(ROT * 180) / Math.PI})" filter="url(#g)">
<rect x="-0.5" y="-0.5" width="1" height="1" rx="0.16" fill="#120a2a" stroke="#00f0ff" stroke-width="0.06"/>
${PIPS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="0.08" fill="#ff2bd6"/>`).join('')}
</g>
</svg>`;
writeFileSync(join(out, 'icon.svg'), svg);
console.log('Icons erzeugt in', out);

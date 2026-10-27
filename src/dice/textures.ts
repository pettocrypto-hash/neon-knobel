import * as THREE from 'three';
import type { Skin } from '../app/cosmetics';

/** Prozedurale Texturen (Canvas) – keine Bilddateien nötig. */

const SIZE = 256;

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.27, 0.27],
    [0.5, 0.5],
    [0.73, 0.73],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.5, 0.5],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  6: [
    [0.27, 0.24],
    [0.73, 0.24],
    [0.27, 0.5],
    [0.73, 0.5],
    [0.27, 0.76],
    [0.73, 0.76],
  ],
};

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

function tex(c: HTMLCanvasElement, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function decorate(g: CanvasRenderingContext2D, skin: Skin, value: number, emissive: boolean) {
  const S = SIZE;
  g.save();
  switch (skin.style) {
    case 'holo': {
      // Hologramm-Streifen
      g.globalAlpha = emissive ? 0.18 : 0.25;
      for (let y = 0; y < S; y += 6) {
        g.fillStyle = y % 12 ? skin.edge : skin.pip;
        g.fillRect(0, y, S, 2);
      }
      break;
    }
    case 'crystal': {
      g.globalAlpha = emissive ? 0.12 : 0.35;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      const pts = [
        [0, 0.3, 0.45, 0],
        [0.2, 1, 1, 0.35],
        [0.6, 0, 1, 0.7],
        [0, 0.8, 0.35, 1],
      ];
      for (const [a, b, c, d] of pts) {
        g.beginPath();
        g.moveTo(a * S, b * S);
        g.lineTo(c * S, d * S);
        g.stroke();
      }
      break;
    }
    case 'glitch': {
      g.globalAlpha = emissive ? 0.5 : 0.6;
      for (let i = 0; i < 7; i++) {
        const y = ((value * 37 + i * 53) % 220) + 10;
        g.fillStyle = i % 2 ? skin.edge : skin.pip;
        g.fillRect(((value * 17 + i * 31) % 120) + 10, y, 30 + ((i * 29) % 90), 3 + (i % 3) * 2);
      }
      break;
    }
    case 'lava': {
      g.globalAlpha = emissive ? 0.6 : 0.8;
      g.strokeStyle = skin.edge;
      g.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        let x = ((value * 41 + i * 61) % S) as number;
        let y = 0;
        g.moveTo(x, y);
        while (y < S) {
          x += ((i * 13 + y) % 30) - 15;
          y += 22;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    }
    case 'ice': {
      g.globalAlpha = emissive ? 0.15 : 0.4;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        const cx = ((value * 29 + i * 47) % 200) + 28;
        const cy = ((value * 53 + i * 31) % 200) + 28;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14);
          g.stroke();
        }
      }
      break;
    }
    case 'gold': {
      if (!emissive) {
        const gr = g.createLinearGradient(0, 0, S, S);
        gr.addColorStop(0, 'rgba(255,240,180,0.35)');
        gr.addColorStop(0.5, 'rgba(120,80,10,0.1)');
        gr.addColorStop(1, 'rgba(255,220,120,0.3)');
        g.fillStyle = gr;
        g.fillRect(0, 0, S, S);
      }
      break;
    }
    case 'void': {
      const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S / 1.3);
      gr.addColorStop(0, emissive ? 'rgba(80,20,200,0.25)' : 'rgba(40,10,90,0.6)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      break;
    }
    case 'matrix': {
      g.globalAlpha = emissive ? 0.35 : 0.5;
      g.fillStyle = skin.pip;
      g.font = '700 16px monospace';
      for (let x = 8; x < S; x += 18)
        for (let y = 16; y < S; y += 20) if ((x * 7 + y * 3 + value * 11) % 5 === 0) g.fillText(String((x + y + value) % 2), x, y);
      break;
    }
    case 'prism': {
      const gr = g.createLinearGradient(0, 0, S, S);
      ['#ff2bd6', '#ffb000', '#b6ff3b', '#00f0ff', '#9d4dff'].forEach((c, i) => gr.addColorStop(i / 4, c));
      g.globalAlpha = emissive ? 0.25 : 0.4;
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
      break;
    }
    default:
      break;
  }
  g.restore();
}

/** Helle Variante eines Skins für das klare Design: heller Körper, dunkle Augen, kein Leuchten. */
function cleanColors(skin: Skin) {
  if (skin.id === 'neon') return { body: '#fbfaf6', pip: '#23262f', edge: '#d9d4c8' };
  return { body: mix(skin.edge, '#ffffff', 0.84), pip: mix(skin.edge, '#000000', 0.62), edge: mix(skin.edge, '#ffffff', 0.55) };
}

function makeCleanFaces(skin: Skin, colorblind: boolean) {
  const c = cleanColors(skin);
  const out: { map: THREE.Texture; emissive: THREE.Texture }[] = [];
  for (let v = 1; v <= 6; v++) {
    const base = canvas();
    const em = canvas();
    const g = base.getContext('2d')!;
    const S = SIZE;
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, mix(c.body, '#ffffff', 0.5));
    gr.addColorStop(1, c.body);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    g.strokeStyle = c.edge;
    g.lineWidth = 6;
    roundRect(g, 8, 8, S - 16, S - 16, 34);
    g.stroke();
    for (const [px, py] of PIPS[v]) {
      const r = v === 1 ? 25 : 20;
      const pg = g.createRadialGradient(px * S - 4, py * S - 4, 2, px * S, py * S, r);
      pg.addColorStop(0, mix(c.pip, '#ffffff', 0.25));
      pg.addColorStop(1, c.pip);
      g.fillStyle = pg;
      g.beginPath();
      g.arc(px * S, py * S, r, 0, Math.PI * 2);
      g.fill();
    }
    if (colorblind) {
      g.fillStyle = c.pip;
      g.font = '800 36px Inter, sans-serif';
      g.textAlign = 'right';
      g.fillText(String(v), S - 30, S - 26);
    }
    em.getContext('2d')!.fillRect(0, 0, S, S); // schwarz = kein Leuchten
    out.push({ map: tex(base), emissive: tex(em) });
  }
  return out;
}

/** Je Augenzahl: Farbtextur + Leuchttextur. */
export function makeFaceTextures(skin: Skin, colorblind: boolean, clean = false) {
  if (clean) return makeCleanFaces(skin, colorblind);
  const out: { map: THREE.Texture; emissive: THREE.Texture }[] = [];
  for (let v = 1; v <= 6; v++) {
    const base = canvas();
    const em = canvas();
    const g = base.getContext('2d')!;
    const e = em.getContext('2d')!;
    const S = SIZE;
    // Körper
    const gr = g.createLinearGradient(0, 0, S, S);
    gr.addColorStop(0, shade(skin.body, 1.6));
    gr.addColorStop(1, skin.body);
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    e.fillStyle = '#000';
    e.fillRect(0, 0, S, S);
    decorate(g, skin, v, false);
    decorate(e, skin, v, true);
    // Leuchtende Kante
    for (const ctx of [g, e]) {
      ctx.save();
      ctx.strokeStyle = skin.edge;
      ctx.lineWidth = 7;
      ctx.shadowColor = skin.edge;
      ctx.shadowBlur = 18;
      roundRect(ctx, 12, 12, S - 24, S - 24, 30);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      roundRect(ctx, 26, 26, S - 52, S - 52, 22);
      ctx.stroke();
      ctx.restore();
    }
    // Augen
    const pipColor = colorblind ? '#ffffff' : skin.pip;
    for (const [px, py] of PIPS[v]) {
      for (const ctx of [g, e]) {
        ctx.save();
        ctx.shadowColor = pipColor;
        ctx.shadowBlur = 22;
        const r = v === 1 ? 26 : 21;
        const pg = ctx.createRadialGradient(px * S - 5, py * S - 5, 2, px * S, py * S, r);
        pg.addColorStop(0, '#ffffff');
        pg.addColorStop(0.45, pipColor);
        pg.addColorStop(1, shade(pipColor, 0.55));
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(px * S, py * S, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (colorblind) {
      // Zusätzliche Ziffer für eindeutige Lesbarkeit
      for (const ctx of [g, e]) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 38px Orbitron, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(v), S - 30, S - 26);
        ctx.restore();
      }
    }
    out.push({ map: tex(base), emissive: tex(em) });
  }
  return out;
}

export function makeGlowTexture(color = 'rgba(255,255,255,1)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color);
  gr.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.45)'));
  gr.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function makeGridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(120,90,255,0.55)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,240,255,0.18)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(64, 0);
  g.lineTo(64, 128);
  g.moveTo(0, 64);
  g.lineTo(128, 64);
  g.stroke();
  g.fillStyle = 'rgba(255,43,214,0.6)';
  g.fillRect(62, 62, 4, 4);
  return tex(c);
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

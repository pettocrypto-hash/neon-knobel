/**
 * Partikel: dezenter Hintergrund (schwebende Neon-Teilchen) und
 * Effekt-Ebene für Funken, Partikelregen und Energie-Flüge.
 */

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
  kind: 'spark' | 'confetti' | 'orb';
  rot: number;
  vr: number;
}

class FxLayer {
  private bg: HTMLCanvasElement;
  private fg: HTMLCanvasElement;
  private bgc: CanvasRenderingContext2D;
  private fgc: CanvasRenderingContext2D;
  private parts: P[] = [];
  private motes: { x: number; y: number; r: number; s: number; c: string; p: number }[] = [];
  private dpr = 1;
  private w = 0;
  private h = 0;
  private last = 0;
  private enabled = true;
  private ambient = true;
  private light = false;

  constructor() {
    this.bg = document.createElement('canvas');
    this.bg.className = 'fx-bg';
    this.fg = document.createElement('canvas');
    this.fg.className = 'fx-fg';
    this.bgc = this.bg.getContext('2d')!;
    this.fgc = this.fg.getContext('2d')!;
    document.body.prepend(this.bg);
    document.body.appendChild(this.fg);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const colors = ['#00f0ff', '#ff2bd6', '#9d4dff', '#b6ff3b'];
    for (let i = 0; i < 38; i++)
      this.motes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 1.8, s: 0.004 + Math.random() * 0.012, c: colors[i % 4], p: Math.random() * 6 });
    requestAnimationFrame((t) => this.loop(t));
  }

  configure(quality: string, reduceMotion: boolean, design = 'neon') {
    // Im hellen Design keine schwebenden Neon-Teilchen und keine additive Mischung
    this.light = design === 'clean';
    this.ambient = quality !== 'low' && !reduceMotion && !this.light;
    this.enabled = !reduceMotion || true;
    if (!this.ambient) this.bgc.clearRect(0, 0, this.w * this.dpr, this.h * this.dpr);
  }

  private resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    for (const c of [this.bg, this.fg]) {
      c.width = this.w * this.dpr;
      c.height = this.h * this.dpr;
    }
  }

  burst(x: number, y: number, color: string | string[], count = 26, power = 1) {
    if (!this.enabled) return;
    const cols = Array.isArray(color) ? color : [color];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (80 + Math.random() * 260) * power;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * power, life: 0, max: 0.5 + Math.random() * 0.6, size: 1.5 + Math.random() * 2.5, color: cols[i % cols.length], g: 380, kind: 'spark', rot: 0, vr: 0 });
    }
  }

  rain(colors: string[], count = 140) {
    for (let i = 0; i < count; i++) {
      this.parts.push({
        x: Math.random() * this.w,
        y: -20 - Math.random() * this.h * 0.6,
        vx: (Math.random() - 0.5) * 60,
        vy: 120 + Math.random() * 220,
        life: 0,
        max: 2.6 + Math.random() * 1.6,
        size: 4 + Math.random() * 5,
        color: colors[i % colors.length],
        g: 60,
        kind: 'confetti',
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  /** Energie-Orbs fliegen von a nach b. */
  orbs(from: { x: number; y: number }, to: { x: number; y: number }, color: string, count = 8) {
    for (let i = 0; i < count; i++) {
      const delay = i * 0.04;
      const dur = 0.55 + Math.random() * 0.2;
      this.parts.push({ x: from.x, y: from.y, vx: to.x, vy: to.y, life: -delay, max: dur, size: 3 + Math.random() * 2, color, g: (Math.random() - 0.5) * 160, kind: 'orb', rot: from.x, vr: from.y });
    }
  }

  private loop(t: number) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0.016);
    this.last = t;
    if (document.hidden) return;
    const d = this.dpr;
    if (this.ambient) {
      const g = this.bgc;
      g.clearRect(0, 0, this.w * d, this.h * d);
      for (const m of this.motes) {
        m.y -= m.s * dt * 4;
        m.p += dt;
        if (m.y < -0.02) {
          m.y = 1.02;
          m.x = Math.random();
        }
        const a = 0.25 + Math.sin(m.p * 1.3) * 0.2;
        g.globalAlpha = Math.max(0, a);
        g.fillStyle = m.c;
        g.beginPath();
        g.arc((m.x * this.w + Math.sin(m.p * 0.5) * 12) * d, m.y * this.h * d, m.r * d, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
    const f = this.fgc;
    f.clearRect(0, 0, this.w * d, this.h * d);
    if (!this.parts.length) return;
    f.globalCompositeOperation = this.light ? 'source-over' : 'lighter';
    this.parts = this.parts.filter((p) => {
      p.life += dt;
      if (p.life < 0) return true;
      if (p.life > p.max) return false;
      const k = p.life / p.max;
      let x: number;
      let y: number;
      if (p.kind === 'orb') {
        const e = k * k * (3 - 2 * k);
        x = p.rot + (p.vx - p.rot) * e + Math.sin(k * Math.PI) * p.g;
        y = p.vr + (p.vy - p.vr) * e - Math.sin(k * Math.PI) * 60;
      } else {
        p.vy += p.g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        x = p.x;
        y = p.y;
      }
      f.globalAlpha = p.kind === 'confetti' ? Math.min(1, (1 - k) * 2) : 1 - k;
      f.fillStyle = p.color;
      f.shadowColor = p.color;
      f.shadowBlur = p.kind === 'confetti' || this.light ? 0 : 10 * d;
      if (p.kind === 'confetti') {
        f.save();
        f.translate(x * d, y * d);
        f.rotate(p.rot);
        f.fillRect((-p.size / 2) * d, (-p.size / 4) * d, p.size * d, (p.size / 2) * d * Math.abs(Math.cos(p.rot * 2)));
        f.restore();
      } else {
        f.beginPath();
        f.arc(x * d, y * d, p.size * d * (p.kind === 'orb' ? 1 : 1 - k * 0.5), 0, Math.PI * 2);
        f.fill();
      }
      return true;
    });
    f.globalAlpha = 1;
    f.shadowBlur = 0;
    f.globalCompositeOperation = 'source-over';
  }
}

let layer: FxLayer | null = null;
export function fx(): FxLayer {
  layer ??= new FxLayer();
  return layer;
}

export function centerOf(el: Element | null): { x: number; y: number } {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

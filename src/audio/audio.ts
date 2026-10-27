import { onSettings, settings } from '../app/settings';

/**
 * Komplett per WebAudio erzeugter Sound: Synthwave-Soundtrack (Sequencer mit
 * Bass, Pad, Arpeggio, Drums) und Effekte. Keine Audiodateien nötig.
 */
export type Sfx =
  | 'click'
  | 'select'
  | 'roll'
  | 'land'
  | 'lock'
  | 'unlock'
  | 'score'
  | 'scratch'
  | 'bonus'
  | 'combo'
  | 'five'
  | 'near'
  | 'turn'
  | 'myturn'
  | 'module'
  | 'win'
  | 'lose'
  | 'error'
  | 'emote'
  | 'levelup'
  | 'tick'
  | 'big';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicOn = false;
  private nextNote = 0;
  private step = 0;
  private schedTimer: ReturnType<typeof setInterval> | null = null;
  private intensity = 0;

  constructor() {
    onSettings(() => this.applyVolumes());
    const unlock = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    const len = ctx.sampleRate * 1.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.musicOn) this.startScheduler();
    return ctx;
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
    this.musicGain.gain.setTargetAtTime(settings.musicOn ? settings.music * 0.5 : 0, t, 0.1);
    this.sfxGain.gain.setTargetAtTime(settings.sfxOn ? settings.sfx : 0, t, 0.05);
  }

  /** 0 = Menü, 1 = Spiel (mehr Drums), 2 = Combo-Streak. */
  setIntensity(n: number) {
    this.intensity = n;
  }

  startMusic() {
    this.musicOn = true;
    if (this.ctx) this.startScheduler();
  }

  stopMusic() {
    this.musicOn = false;
    if (this.schedTimer) clearInterval(this.schedTimer);
    this.schedTimer = null;
  }

  private startScheduler() {
    if (this.schedTimer || !this.ctx) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.schedTimer = setInterval(() => this.schedule(), 30);
  }

  // ---------- Bausteine ----------

  private osc(type: OscillatorType, freq: number, t: number, dur: number, gain: number, dest: AudioNode, slideTo?: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  private noise(t: number, dur: number, gain: number, dest: AudioNode, filter: BiquadFilterType, f0: number, f1?: number, q = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const flt = ctx.createBiquadFilter();
    flt.type = filter;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- Musik ----------

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn) return;
    const bpm = 98 + this.intensity * 6;
    const sixteenth = 60 / bpm / 4;
    while (this.nextNote < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextNote, sixteenth);
      this.nextNote += sixteenth;
      this.step = (this.step + 1) % 256;
    }
  }

  private playStep(step: number, t: number, len: number) {
    const dest = this.musicGain;
    // Akkordfolge Dm – Bb – F – C (je 1 Takt = 16 Schritte)
    const roots = [50, 46, 53, 48];
    const chords = [
      [0, 3, 7],
      [0, 4, 7],
      [0, 4, 7],
      [0, 4, 7],
    ];
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const root = roots[bar];
    const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

    // Bass: treibende Achtel
    if (s % 2 === 0) {
      const note = root - 24 + (s % 8 === 6 ? 12 : 0);
      const o = this.osc('sawtooth', mtof(note), t, len * 1.8, 0.11, this.lowpass(dest, 420 + 200 * Math.sin(step / 9)));
      o.detune.value = -5;
    }
    // Pad: Akkord zu Taktbeginn
    if (s === 0) {
      for (const iv of chords[bar]) {
        const p = this.osc('triangle', mtof(root + iv), t, len * 15, 0.035, dest);
        p.detune.value = 8;
      }
    }
    // Arpeggio
    if (s % 2 === 1 || this.intensity > 0) {
      const arp = chords[bar];
      const n = root + 12 + arp[(step >> (this.intensity > 0 ? 0 : 1)) % 3] + (s >= 8 ? 12 : 0);
      this.osc('square', mtof(n), t, len * 0.8, 0.018, this.lowpass(dest, 2400));
    }
    // Drums
    if (s % 4 === 0) {
      this.osc('sine', 120, t, 0.32, 0.4, dest, 38);
    }
    if (s === 4 || s === 12) this.noise(t, 0.18, 0.12, dest, 'bandpass', 1800, 900, 0.8);
    if (this.intensity > 0 || s % 4 === 2) this.noise(t, 0.04, s % 4 === 2 ? 0.05 : 0.025, dest, 'highpass', 8000);
  }

  private lowpass(dest: AudioNode, f: number) {
    const flt = this.ctx!.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = f;
    flt.Q.value = 6;
    flt.connect(dest);
    // Filter wird nach Ende der Quelle vom GC eingesammelt.
    return flt;
  }

  // ---------- Effekte ----------

  /** Stufe 0..n für steigende Combo-Töne. */
  play(name: Sfx, level = 0) {
    const ctx = this.ensure();
    if (!ctx || settings.muted || !settings.sfxOn || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.005;
    const d = this.sfxGain;
    switch (name) {
      case 'click':
        this.osc('square', 1200, t, 0.05, 0.04, d, 800);
        break;
      case 'select':
        this.osc('triangle', 660, t, 0.07, 0.08, d);
        this.osc('triangle', 990, t + 0.05, 0.08, 0.06, d);
        break;
      case 'roll':
        // Klackern: viele kurze, gefilterte Rauschimpulse
        for (let i = 0; i < 14; i++) {
          const tt = t + i * 0.045 + Math.random() * 0.03;
          this.noise(tt, 0.035, 0.22 * (1 - i / 16), d, 'bandpass', 2200 + Math.random() * 2400, undefined, 3);
          if (i % 3 === 0) this.osc('square', 300 + Math.random() * 200, tt, 0.03, 0.03, d, 120);
        }
        this.osc('sawtooth', 120, t, 0.5, 0.03, this.lowpass(d, 800), 400);
        break;
      case 'land':
        this.noise(t, 0.05, 0.25, d, 'bandpass', 1600 + Math.random() * 800, undefined, 4);
        this.osc('sine', 200, t, 0.06, 0.08, d, 90);
        break;
      case 'lock':
        this.osc('square', 880, t, 0.05, 0.05, d);
        this.osc('sine', 1760, t + 0.04, 0.12, 0.06, d);
        this.noise(t, 0.04, 0.06, d, 'highpass', 6000);
        break;
      case 'unlock':
        this.osc('sine', 1320, t, 0.06, 0.05, d, 700);
        break;
      case 'score':
        [784, 1046].forEach((f, i) => this.osc('triangle', f, t + i * 0.06, 0.18, 0.08, d));
        this.osc('sine', 392, t, 0.25, 0.08, d);
        break;
      case 'scratch':
        this.noise(t, 0.25, 0.2, d, 'bandpass', 3000, 600, 2);
        this.osc('sawtooth', 220, t, 0.25, 0.04, this.lowpass(d, 900), 110);
        break;
      case 'bonus':
        [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => this.osc('square', f, t + i * 0.06, 0.25, 0.05, d));
        this.osc('sine', 130, t, 0.6, 0.2, d, 260);
        break;
      case 'combo': {
        const base = 523 * 2 ** (Math.min(level, 10) / 12);
        [1, 1.26, 1.5, 2].forEach((m, i) => this.osc('square', base * m, t + i * 0.055, 0.14, 0.045, d));
        break;
      }
      case 'big':
        [659, 830, 988, 1318].forEach((f, i) => this.osc('sawtooth', f, t + i * 0.07, 0.3, 0.05, this.lowpass(d, 3000)));
        this.noise(t, 0.4, 0.12, d, 'highpass', 5000);
        break;
      case 'five':
        this.noise(t, 1.6, 0.35, d, 'lowpass', 6000, 120);
        this.osc('sine', 60, t, 1.4, 0.5, d, 30);
        [523, 659, 784, 1046, 1318, 1568, 2093].forEach((f, i) => this.osc('square', f, t + 0.15 + i * 0.07, 0.6, 0.05, d));
        [261, 329, 392, 523].forEach((f) => this.osc('sawtooth', f, t + 0.7, 1.6, 0.05, this.lowpass(d, 2400)));
        break;
      case 'near':
        this.osc('triangle', 660, t, 0.18, 0.08, d, 620);
        this.osc('triangle', 520, t + 0.16, 0.35, 0.08, d, 440);
        break;
      case 'turn':
        this.osc('triangle', 880, t, 0.1, 0.05, d);
        break;
      case 'myturn':
        this.osc('triangle', 880, t, 0.1, 0.07, d);
        this.osc('triangle', 1320, t + 0.09, 0.16, 0.07, d);
        break;
      case 'module':
        this.osc('sawtooth', 200, t, 0.35, 0.08, this.lowpass(d, 2500), 1600);
        for (let i = 0; i < 5; i++) this.osc('sine', 1000 + i * 260, t + 0.2 + i * 0.03, 0.15, 0.04, d);
        break;
      case 'win':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc('square', f, t + i * 0.12, 0.5, 0.06, d));
        [261, 329, 392].forEach((f) => this.osc('triangle', f, t + 0.6, 1.6, 0.08, d));
        [1046, 1318, 1568].forEach((f) => this.osc('square', f, t + 0.9, 1.2, 0.03, d));
        break;
      case 'lose':
        [392, 349, 311, 261].forEach((f, i) => this.osc('sawtooth', f, t + i * 0.22, 0.4, 0.05, this.lowpass(d, 1400)));
        break;
      case 'error':
        this.osc('square', 180, t, 0.1, 0.05, d);
        this.osc('square', 140, t + 0.09, 0.12, 0.05, d);
        break;
      case 'emote':
        this.osc('sine', 1200, t, 0.08, 0.06, d, 1800);
        this.osc('sine', 1800, t + 0.07, 0.1, 0.04, d);
        break;
      case 'levelup':
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.osc('triangle', f, t + i * 0.08, 0.4, 0.07, d));
        this.noise(t + 0.4, 0.6, 0.08, d, 'highpass', 7000);
        break;
      case 'tick':
        this.osc('square', 1600, t, 0.03, 0.03, d);
        break;
    }
  }
}

export const audio = new AudioEngine();

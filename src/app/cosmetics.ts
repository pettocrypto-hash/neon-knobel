/** Würfel-Skins, Block-Themes und Profil-Rahmen mit Freischalt-Level. */

export interface Skin {
  id: string;
  name: string;
  level: number;
  /** Grundfarbe des Würfelkörpers */
  body: string;
  /** Augen / Leuchtfarbe */
  pip: string;
  /** Kanten-/Glow-Farbe */
  edge: string;
  /** 0 = matt, 1 = Glas */
  glass: number;
  style: 'neon' | 'holo' | 'crystal' | 'glitch' | 'lava' | 'ice' | 'gold' | 'void' | 'matrix' | 'prism';
  /** Nur über Tages-Streak erhältlich */
  daily?: boolean;
}

export const SKINS: Skin[] = [
  { id: 'neon', name: 'Neon', level: 1, body: '#0b0820', pip: '#00f0ff', edge: '#00f0ff', glass: 0.25, style: 'neon' },
  { id: 'holo', name: 'Hologramm', level: 2, body: '#14123a', pip: '#ff2bd6', edge: '#7af6ff', glass: 0.65, style: 'holo' },
  { id: 'crystal', name: 'Kristall', level: 4, body: '#1d2a5a', pip: '#ffffff', edge: '#a98bff', glass: 0.8, style: 'crystal' },
  { id: 'glitch', name: 'Glitch', level: 6, body: '#120414', pip: '#b6ff3b', edge: '#ff2bd6', glass: 0.2, style: 'glitch' },
  { id: 'lava', name: 'Lava', level: 8, body: '#1a0602', pip: '#ffb000', edge: '#ff4b1f', glass: 0.15, style: 'lava' },
  { id: 'ice', name: 'Eis', level: 10, body: '#0f2d44', pip: '#e6fbff', edge: '#7fd8ff', glass: 0.75, style: 'ice' },
  { id: 'gold', name: 'Goldrausch', level: 13, body: '#2a1e05', pip: '#fff2b0', edge: '#ffc83d', glass: 0.1, style: 'gold' },
  { id: 'void', name: 'Void', level: 16, body: '#020104', pip: '#9d4dff', edge: '#4d1dff', glass: 0.05, style: 'void' },
  { id: 'matrix', name: 'Matrix', level: 20, body: '#001006', pip: '#39ff88', edge: '#39ff88', glass: 0.3, style: 'matrix' },
  { id: 'prism', name: 'Tages-Prisma', level: 1, body: '#160a2a', pip: '#ffffff', edge: '#ff7bf0', glass: 0.7, style: 'prism', daily: true },
];

export interface Theme {
  id: string;
  name: string;
  level: number;
  a: string; // Akzent 1
  b: string; // Akzent 2
}

export const THEMES: Theme[] = [
  { id: 'cyan', name: 'Cyan-Terminal', level: 1, a: '#00f0ff', b: '#ff2bd6' },
  { id: 'magenta', name: 'Magenta-Puls', level: 3, a: '#ff2bd6', b: '#9d4dff' },
  { id: 'matrix', name: 'Matrix', level: 5, a: '#39ff88', b: '#b6ff3b' },
  { id: 'sunset', name: 'Sunset-Drive', level: 9, a: '#ff8a3d', b: '#ff2b6e' },
  { id: 'ultra', name: 'Ultraviolett', level: 12, a: '#a98bff', b: '#00f0ff' },
];

export interface Frame {
  id: string;
  name: string;
  level: number;
}

export const FRAMES: Frame[] = [
  { id: 'basic', name: 'Basis', level: 1 },
  { id: 'pulse', name: 'Puls', level: 3 },
  { id: 'circuit', name: 'Schaltkreis', level: 7 },
  { id: 'crown', name: 'Krone', level: 11 },
  { id: 'plasma', name: 'Plasma', level: 15 },
];

export const skinById = (id: string) => SKINS.find((s) => s.id === id) ?? SKINS[0];

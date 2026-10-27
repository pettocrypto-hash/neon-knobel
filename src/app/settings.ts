export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  name: string;
  music: number;
  sfx: number;
  muted: boolean;
  musicOn: boolean;
  sfxOn: boolean;
  quality: Quality;
  vibrate: boolean;
  shake: boolean;
  colorblind: boolean;
  emotesMuted: boolean;
  confirmScore: boolean;
  reduceMotion: boolean;
  skin: string;
  theme: string;
  frame: string;
}

const KEY = 'neonknobel.settings';

function defaults(): Settings {
  const lowEnd = typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4;
  const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    name: '',
    music: 0.35,
    sfx: 0.7,
    muted: false,
    musicOn: true,
    sfxOn: true,
    quality: lowEnd ? 'medium' : 'high',
    vibrate: true,
    shake: true,
    colorblind: false,
    emotesMuted: false,
    confirmScore: true,
    reduceMotion: reduce,
    skin: 'neon',
    theme: 'cyan',
    frame: 'basic',
  };
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw) };
  } catch {
    /* ignorieren */
  }
  return defaults();
}

export const settings: Settings = load();
const listeners = new Set<() => void>();

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignorieren */
  }
  applyDocumentSettings();
  for (const fn of listeners) fn();
}

export function onSettings(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyDocumentSettings() {
  const d = document.documentElement.dataset;
  d.quality = settings.quality;
  d.theme = settings.theme;
  d.cb = settings.colorblind ? '1' : '0';
  d.motion = settings.reduceMotion ? 'reduce' : 'full';
}

export function vibrate(pattern: number | number[]) {
  if (!settings.vibrate) return;
  // Ohne vorherige Nutzergeste blockiert der Browser die Vibration (und loggt Fehler).
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (ua && !ua.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* nicht unterstützt */
  }
}

/** Dauerhafte, öffentliche Client-ID (steht im Spielzustand). */
export function clientId(): string {
  return stored('neonknobel.client', 'c-');
}

/** Geheimer Schlüssel, mit dem sich dieses Gerät beim Host als Besitzer seines Platzes ausweist. */
export function clientSecret(): string {
  return stored('neonknobel.secret', 's-');
}

function stored(k: string, prefix: string): string {
  try {
    let id = localStorage.getItem(k);
    if (!id) {
      id = prefix + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36).padStart(2, '0')).join('');
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return prefix + Math.random().toString(36).slice(2);
  }
}

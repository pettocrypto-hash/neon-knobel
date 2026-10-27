import { PROGRESSION } from '../config/rules';
import { ranking } from '../game/engine';
import { CATS, CAT_LABEL, columnSums, totalScore, type Cat } from '../game/scoring';
import type { GameState, Mode, PlayerStats } from '../game/types';
import { FRAMES, SKINS, THEMES } from './cosmetics';

/**
 * Lokales Profil: XP, Level, Freischaltungen, Erfolge, Tages-Challenge,
 * Statistiken. Alles im localStorage, kein Login.
 */

export interface HistoryEntry {
  date: number;
  mode: Mode;
  score: number;
  rank: number;
  players: number;
  won: boolean;
}

export interface Profile {
  xp: number;
  achievements: Record<string, number>;
  dailySkin: boolean;
  daily: { day: string; done: boolean; streak: number; lastDone: string };
  stats: {
    games: number;
    wins: number;
    mpGames: number;
    bestClassic: number;
    bestMarathon: number;
    totalScore: number;
    fiveKinds: number;
    largeStraights: number;
    bonusCols: number;
    modules: number;
    bestStreak: number;
    catPoints: Partial<Record<Cat, number>>;
    history: HistoryEntry[];
  };
  seenGames: string[];
}

const KEY = 'neonknobel.profile';

function fresh(): Profile {
  return {
    xp: 0,
    achievements: {},
    dailySkin: false,
    daily: { day: '', done: false, streak: 0, lastDone: '' },
    stats: {
      games: 0,
      wins: 0,
      mpGames: 0,
      bestClassic: 0,
      bestMarathon: 0,
      totalScore: 0,
      fiveKinds: 0,
      largeStraights: 0,
      bonusCols: 0,
      modules: 0,
      bestStreak: 0,
      catPoints: {},
      history: [],
    },
    seenGames: [],
  };
}

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      const f = fresh();
      return { ...f, ...p, daily: { ...f.daily, ...p.daily }, stats: { ...f.stats, ...p.stats } };
    }
  } catch {
    /* ignorieren */
  }
  return fresh();
}

export const profile: Profile = load();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* ignorieren */
  }
}

// ---------- Level ----------

export function levelInfo(xp = profile.xp) {
  let level = 1;
  let rest = xp;
  while (rest >= PROGRESSION.xpForLevel(level)) {
    rest -= PROGRESSION.xpForLevel(level);
    level++;
  }
  const need = PROGRESSION.xpForLevel(level);
  return { level, into: rest, need, pct: rest / need };
}

export const isSkinUnlocked = (id: string) => {
  const s = SKINS.find((x) => x.id === id);
  if (!s) return false;
  return s.daily ? profile.dailySkin : levelInfo().level >= s.level;
};
export const isThemeUnlocked = (id: string) => levelInfo().level >= (THEMES.find((x) => x.id === id)?.level ?? 99);
export const isFrameUnlocked = (id: string) => levelInfo().level >= (FRAMES.find((x) => x.id === id)?.level ?? 99);

// ---------- Tages-Challenge ----------

export interface GameSummary {
  mode: Mode;
  modulesOn: boolean;
  score: number;
  rank: number;
  players: number;
  won: boolean;
  stats: PlayerStats;
  beatHardBot: boolean;
  comeback: boolean;
  allBonus: boolean;
  cols: number;
}

interface Challenge {
  id: string;
  text: string;
  check: (g: GameSummary) => boolean;
}

const CHALLENGES: Challenge[] = [
  { id: 'large2', text: 'Trage in einem Spiel 2 Große Straßen ein.', check: (g) => g.stats.largeStraights >= 2 },
  { id: 'five', text: 'Würfle 5 Gleiche.', check: (g) => g.stats.fiveKinds >= 1 },
  { id: 'bonus', text: 'Hol dir den Bonus (63+ im oberen Teil).', check: (g) => g.stats.bonusCols >= 1 },
  { id: 'score250', text: 'Erziele mindestens 250 Punkte in einer Klassik-Partie.', check: (g) => g.mode === 'classic' && g.score >= 250 },
  { id: 'streak4', text: 'Baue einen Combo-Streak von 4 auf.', check: (g) => g.stats.bestStreak >= 4 },
  { id: 'win', text: 'Gewinne eine Partie gegen mindestens einen Gegner.', check: (g) => g.won && g.players > 1 },
  { id: 'clean', text: 'Beende eine Klassik-Partie mit höchstens 1 Streichung.', check: (g) => g.mode === 'classic' && g.stats.scratches <= 1 },
  { id: 'fh3', text: 'Trage in einem Spiel 2 Volle Häuser ein.', check: (g) => g.stats.fullHouses >= 2 },
  { id: 'mods3', text: 'Zünde 3 Module in einer Partie.', check: (g) => g.stats.modules >= 3 },
  { id: 'purist', text: 'Erreiche im Purist-Modus (ohne Module) 220 Punkte.', check: (g) => !g.modulesOn && g.score >= 220 * g.cols },
  { id: 'small2', text: 'Trage 2 Kleine Straßen ein.', check: (g) => g.stats.smallStraights >= 2 },
];

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function todaysChallenge(): Challenge {
  return CHALLENGES[hashStr('nk' + dayKey()) % CHALLENGES.length];
}

function refreshDaily() {
  const today = dayKey();
  if (profile.daily.day !== today) {
    profile.daily.day = today;
    profile.daily.done = false;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (profile.daily.lastDone !== dayKey(y) && profile.daily.lastDone !== today) profile.daily.streak = 0;
  }
}

export function dailyState() {
  refreshDaily();
  return { challenge: todaysChallenge(), done: profile.daily.done, streak: profile.daily.streak };
}

// ---------- Erfolge ----------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  hidden?: boolean;
  check: (g: GameSummary, p: Profile) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'Eingeloggt', desc: 'Beende dein erstes Spiel.', check: () => true },
  { id: 'five', name: 'Fünfling!', desc: 'Trage 5 Gleiche ein.', check: (g) => g.stats.fiveKinds >= 1 },
  { id: 'fiveFirst', name: 'Direkttreffer', desc: '5 Gleiche im ersten Wurf.', hidden: true, check: (g) => g.stats.fiveKindFirst >= 1 },
  { id: 'fiveTwice', name: 'Doppel-Fünfling', desc: 'Zweimal 5 Gleiche in einer Partie.', check: (g) => g.stats.fiveKinds >= 2 },
  { id: 'bonus', name: 'Bonusjäger', desc: 'Erreiche den Bonus im oberen Teil.', check: (g) => g.stats.bonusCols >= 1 },
  { id: 'bonusAll', name: 'Bonus-Imperator', desc: 'Bonus in allen 7 Spalten.', hidden: true, check: (g) => g.mode === 'marathon' && g.allBonus },
  { id: 'perfect', name: 'Saubere Spalte', desc: 'Eine Spalte mit Bonus und ohne Streichung.', check: (g) => g.stats.perfectCols >= 1 },
  { id: 'street3', name: 'Straßenkönig', desc: '3 Große Straßen in einer Partie.', check: (g) => g.stats.largeStraights >= 3 },
  { id: 'largeFirst', name: 'Glückspilz', desc: 'Große Straße im ersten Wurf.', hidden: true, check: (g) => g.stats.largeFirst >= 1 },
  { id: 'win', name: 'Sieger', desc: 'Gewinne eine Partie gegen mindestens einen Gegner.', check: (g) => g.won && g.players > 1 },
  { id: 'hardBot', name: 'Botbrecher', desc: 'Schlage einen Bot der Stufe Schwer.', check: (g) => g.beatHardBot },
  { id: 'full4', name: 'Volles Haus', desc: 'Spiele eine Partie zu viert.', check: (g) => g.players >= 4 },
  { id: 'marathon', name: 'Marathonläufer', desc: 'Beende eine Marathon-Partie (7 Spalten).', check: (g) => g.mode === 'marathon' },
  { id: 's300', name: '300er-Club', desc: 'Mindestens 300 Punkte in Klassik.', check: (g) => g.mode === 'classic' && g.score >= 300 },
  { id: 's350', name: 'Elite', desc: 'Mindestens 350 Punkte in Klassik.', hidden: true, check: (g) => g.mode === 'classic' && g.score >= 350 },
  { id: 'streak5', name: 'Combo x5', desc: 'Combo-Streak von 5.', check: (g) => g.stats.bestStreak >= 5 },
  { id: 'streak10', name: 'Überladen', desc: 'Combo-Streak von 10.', hidden: true, check: (g) => g.stats.bestStreak >= 10 },
  { id: 'engineer', name: 'Energie-Ingenieur', desc: 'Zünde insgesamt 15 Module.', check: (_g, p) => p.stats.modules >= 15 },
  { id: 'purist', name: 'Purist', desc: 'Gewinne eine Partie ohne Module.', check: (g) => !g.modulesOn && g.won && g.players > 1 },
  { id: 'comeback', name: 'Comeback', desc: 'Gewinne, obwohl du zur Halbzeit hinten lagst.', hidden: true, check: (g) => g.comeback },
  { id: 'unlucky', name: 'Pechsträhne', desc: 'Streiche 5 Felder in einer Klassik-Partie.', hidden: true, check: (g) => g.mode === 'classic' && g.stats.scratches >= 5 },
  { id: 'chance5', name: 'Nullnummer', desc: 'Trage eine Chance mit nur 5 Punkten ein.', hidden: true, check: (g) => g.stats.chance5 >= 1 },
  { id: 'near5', name: 'So knapp!', desc: 'Erlebe 5 Beinahe-Momente in einer Partie.', check: (g) => g.stats.nearMisses >= 5 },
  { id: 'veteran', name: 'Stammspieler', desc: 'Spiele 25 Partien.', check: (_g, p) => p.stats.games >= 25 },
  { id: 'dailyFirst', name: 'Tagwerk', desc: 'Schaffe deine erste Tages-Challenge.', check: (_g, p) => p.daily.streak >= 1 },
  { id: 'daily7', name: 'Sieben Tage Neon', desc: '7 Tage Challenge-Streak.', check: (_g, p) => p.daily.streak >= 7 },
  { id: 'collector', name: 'Sammler', desc: 'Schalte 5 Würfel-Skins frei.', check: () => SKINS.filter((s) => isSkinUnlocked(s.id)).length >= 5 },
];

// ---------- Auswertung nach Spielende ----------

export interface GameReward {
  xp: number;
  breakdown: { label: string; xp: number }[];
  levelBefore: number;
  levelAfter: number;
  unlocked: string[];
  achievements: Achievement[];
  daily: boolean;
  summary: GameSummary;
  newRecord: boolean;
}

export function summarize(s: GameState, me: string): GameSummary | null {
  const p = s.players.find((x) => x.id === me);
  if (!p) return null;
  const rank = ranking(s);
  const myScore = totalScore(p.cols);
  const place = rank.filter((x) => totalScore(x.cols) > myScore).length + 1;
  const won = place === 1;
  const half = s.halfStand;
  return {
    mode: s.config.mode,
    modulesOn: s.config.modules,
    score: myScore,
    rank: place,
    players: s.players.length,
    won,
    stats: p.stats,
    beatHardBot: s.players.some((x) => x.bot === 'hard' && totalScore(x.cols) < myScore),
    comeback: won && s.players.length > 1 && !!half && half[0] !== me,
    allBonus: p.cols.every((c) => columnSums(c).bonus > 0),
    cols: p.cols.length,
  };
}

/** Wird genau einmal pro Partie und Gerät aufgerufen. */
export function applyGameResult(s: GameState, me: string): GameReward | null {
  const gameKey = `${s.room}-${s.gameNo}-${s.startedAt}`;
  if (profile.seenGames.includes(gameKey)) return null;
  const g = summarize(s, me);
  if (!g) return null;
  profile.seenGames = [...profile.seenGames.slice(-30), gameKey];

  const lvBefore = levelInfo().level;
  const st = profile.stats;
  const best = g.mode === 'classic' ? st.bestClassic : st.bestMarathon;
  const newRecord = g.score > best && st.games > 0;
  st.games++;
  if (g.players > 1) st.mpGames++;
  if (g.won && g.players > 1) st.wins++;
  if (g.mode === 'classic') st.bestClassic = Math.max(st.bestClassic, g.score);
  else st.bestMarathon = Math.max(st.bestMarathon, g.score);
  st.totalScore += g.score;
  st.fiveKinds += g.stats.fiveKinds;
  st.largeStraights += g.stats.largeStraights;
  st.bonusCols += g.stats.bonusCols;
  st.modules += g.stats.modules;
  st.bestStreak = Math.max(st.bestStreak, g.stats.bestStreak);
  for (const [cat, pts] of Object.entries(g.stats.catPoints)) st.catPoints[cat as Cat] = (st.catPoints[cat as Cat] ?? 0) + (pts ?? 0);
  st.history = [{ date: Date.now(), mode: g.mode, score: g.score, rank: g.rank, players: g.players, won: g.won }, ...st.history].slice(0, 20);

  const breakdown: { label: string; xp: number }[] = [];
  breakdown.push({ label: 'Partie beendet', xp: PROGRESSION.BASE_XP * g.cols });
  breakdown.push({ label: `${g.score} Punkte`, xp: Math.round(g.score * PROGRESSION.XP_PER_POINT) });
  if (g.won && g.players > 1) breakdown.push({ label: 'Sieg', xp: PROGRESSION.WIN_XP_PER_OPPONENT * (g.players - 1) });

  // Tages-Challenge
  refreshDaily();
  let daily = false;
  if (!profile.daily.done && todaysChallenge().check(g)) {
    daily = true;
    profile.daily.done = true;
    profile.daily.streak = profile.daily.lastDone === dayKey() ? profile.daily.streak : profile.daily.streak + 1;
    profile.daily.lastDone = dayKey();
    breakdown.push({ label: `Tages-Challenge (Streak ${profile.daily.streak})`, xp: PROGRESSION.DAILY_XP + 10 * Math.min(profile.daily.streak, 10) });
    if (profile.daily.streak >= 7) profile.dailySkin = true;
  }

  // Erfolge
  const got: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (profile.achievements[a.id]) continue;
    if (a.check(g, profile)) {
      profile.achievements[a.id] = Date.now();
      got.push(a);
    }
  }
  if (got.length) breakdown.push({ label: `${got.length} Erfolg${got.length > 1 ? 'e' : ''}`, xp: got.length * PROGRESSION.ACHIEVEMENT_XP });

  const xp = breakdown.reduce((a, b) => a + b.xp, 0);
  profile.xp += xp;
  const lvAfter = levelInfo().level;
  const unlocked: string[] = [];
  for (let l = lvBefore + 1; l <= lvAfter; l++) {
    for (const s2 of SKINS) if (!s2.daily && s2.level === l) unlocked.push(`Würfel-Skin „${s2.name}“`);
    for (const t of THEMES) if (t.level === l) unlocked.push(`Block-Theme „${t.name}“`);
    for (const f of FRAMES) if (f.level === l) unlocked.push(`Profil-Rahmen „${f.name}“`);
  }
  if (daily && profile.daily.streak === 7) unlocked.push('Würfel-Skin „Tages-Prisma“');
  // Sammler kann erst nach dem Level-Up erfüllt sein
  const collector = ACHIEVEMENTS.find((a) => a.id === 'collector')!;
  if (!profile.achievements.collector && collector.check(g, profile)) {
    profile.achievements.collector = Date.now();
    got.push(collector);
    profile.xp += PROGRESSION.ACHIEVEMENT_XP;
  }
  saveProfile();
  return { xp, breakdown, levelBefore: lvBefore, levelAfter: levelInfo().level, unlocked, achievements: got, daily, summary: g, newRecord };
}

export function favoriteCategory(): string {
  let best: Cat | null = null;
  for (const c of CATS) if ((profile.stats.catPoints[c] ?? 0) > (best ? profile.stats.catPoints[best] ?? 0 : 0)) best = c;
  return best ? CAT_LABEL[best] : '–';
}

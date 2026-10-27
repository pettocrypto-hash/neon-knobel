import { RULES } from '../config/rules';
import { canUseModule, currentPlayer, freeCells, type Rng } from './engine';
import { CATS, UPPER, columnSums, counts, score, type Cat } from './scoring';
import type { BotLevel, GameState, Player, PlayerAction } from './types';

/**
 * Bots in drei Stärken. Alle nutzen dieselbe Bewertung von Feldern,
 * unterscheiden sich aber in Rauschen, Weitsicht beim Halten und Modul-Nutzung.
 */

/** Erwartungswerte je Kategorie (grob, für "lohnt sich das Feld?"). */
const EXP: Record<Cat, number> = {
  ones: 2.1,
  twos: 5.3,
  threes: 8.6,
  fours: 12.2,
  fives: 15.7,
  sixes: 19.2,
  pair: 22,
  twoPairs: 19,
  three: 17,
  four: 9,
  fullHouse: 17,
  smallStraight: 21,
  largeStraight: 22,
  fiveKind: 14,
  chance: 22,
};

const PROFILE: Record<BotLevel, { noise: number; lookahead: boolean; earlyStop: number; modules: 'none' | 'basic' | 'full' }> = {
  easy: { noise: 7, lookahead: false, earlyStop: 0.25, modules: 'none' },
  medium: { noise: 2.5, lookahead: true, earlyStop: 0, modules: 'basic' },
  hard: { noise: 0, lookahead: true, earlyStop: 0, modules: 'full' },
};

/** Wert eines Eintrags: Punkte relativ zum Erwartungswert, inkl. Bonus-Fortschritt. */
function cellValue(p: Player, col: number, cat: Cat, pts: number): number {
  let v = pts - EXP[cat];
  const ui = UPPER.indexOf(cat);
  if (ui >= 0) {
    const face = ui + 1;
    const sums = columnSums(p.cols[col]);
    if (!sums.bonus) {
      const par = face * 3;
      const after = sums.upperSub + pts;
      if (after >= RULES.UPPER_BONUS_THRESHOLD) v += 30;
      else v += (pts - par) * 1.2;
    }
  }
  if (pts === 0) {
    // Streichen: billige Felder bevorzugen
    v = -EXP[cat] - (cat === 'fiveKind' ? 4 : 0);
  }
  return v;
}

interface Choice {
  col: number;
  cat: Cat;
  v: number;
}

function bestChoice(p: Player, dice: number[], noise = 0, rng?: Rng): Choice {
  const sc: Partial<Record<Cat, number>> = {};
  for (const c of CATS) sc[c] = score(dice, c);
  let best: Choice = { col: 0, cat: 'chance', v: -Infinity };
  for (const f of freeCells(p)) {
    let v = cellValue(p, f.col, f.cat, sc[f.cat]!);
    if (noise && rng) v += (rng() - 0.5) * 2 * noise;
    if (v > best.v) best = { ...f, v };
  }
  return best;
}

type Evaluator = (dice: number[]) => number;

/**
 * Baut eine Bewertungsfunktion "bester Eintrag für diese Würfel" mit Cache.
 * Freie Felder werden zusammengefasst (unterer Teil hängt nicht von der Spalte ab),
 * damit auch der Marathon mit 105 Feldern schnell bleibt.
 */
function evaluator(p: Player): Evaluator {
  const groups = new Map<string, { col: number; cat: Cat }>();
  for (const f of freeCells(p)) {
    const ui = UPPER.indexOf(f.cat);
    const key = ui >= 0 ? `${f.cat}|${columnSums(p.cols[f.col]).upperSub}|${columnSums(p.cols[f.col]).bonus}` : f.cat;
    if (!groups.has(key)) groups.set(key, f);
  }
  const reps = [...groups.values()];
  const memo = new Map<string, number>();
  return (dice) => {
    const key = dice.slice().sort().join('');
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let best = -Infinity;
    for (const f of reps) {
      const v = cellValue(p, f.col, f.cat, score(dice, f.cat));
      if (v > best) best = v;
    }
    memo.set(key, best);
    return best;
  };
}

/** Alle Würfel-Multimengen für k Würfel mit Wahrscheinlichkeit. */
const OUTCOMES: { dice: number[]; prob: number }[][] = [];
(function precompute() {
  const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
  for (let k = 0; k <= RULES.DICE; k++) {
    const list: { dice: number[]; prob: number }[] = [];
    const rec = (start: number, acc: number[]) => {
      if (acc.length === k) {
        const c = counts(acc);
        let perms = fact(k);
        for (let v = 1; v <= 6; v++) perms /= fact(c[v]);
        list.push({ dice: acc.slice(), prob: perms / 6 ** k });
        return;
      }
      for (let v = start; v <= 6; v++) {
        acc.push(v);
        rec(v, acc);
        acc.pop();
      }
    };
    rec(1, []);
    OUTCOMES.push(list);
  }
})();

/** Beste Halte-Maske per exakter Erwartungswert-Rechnung (ein Wurf voraus). */
function bestHold(p: Player, dice: number[], locked: boolean[]): boolean[] {
  const value = evaluator(p);
  const seen = new Map<string, number>();
  let bestMask = dice.map(() => true);
  let bestE = value(dice) + 0.5; // leichter Bonus fürs Behalten
  for (let m = 0; m < 1 << RULES.DICE; m++) {
    const mask = dice.map((_, i) => !!(m & (1 << i)) || locked[i]);
    const kept = dice.filter((_, i) => mask[i]);
    const key = kept.slice().sort().join('');
    if (seen.has(key)) continue;
    let e = 0;
    for (const o of OUTCOMES[RULES.DICE - kept.length]) e += o.prob * value(kept.concat(o.dice));
    seen.set(key, e);
    if (e > bestE) {
      bestE = e;
      bestMask = mask;
    }
  }
  return bestMask;
}

/** Einfache Halte-Heuristik (leichter Bot). */
function simpleHold(dice: number[], locked: boolean[]): boolean[] {
  const c = counts(dice);
  const sorted = [...new Set(dice)].sort();
  // 4er-Folge behalten
  for (let s = 1; s <= 3; s++) {
    if ([s, s + 1, s + 2, s + 3].every((v) => c[v])) {
      const want = new Set([s, s + 1, s + 2, s + 3]);
      return dice.map((d, i) => locked[i] || (want.has(d) && (want.delete(d), true)));
    }
  }
  let bestV = 6;
  for (let v = 6; v >= 1; v--) if (c[v] > c[bestV]) bestV = v;
  if (c[bestV] === 1 && sorted.length === 5) bestV = 6;
  return dice.map((d, i) => locked[i] || d === bestV);
}

/** Nächster Schritt des aktiven Bots (eine Aktion pro Aufruf, damit Mitspieler zusehen können). */
export function botStep(s: GameState, rng: Rng): PlayerAction {
  const p = currentPlayer(s);
  const prof = PROFILE[p.bot ?? 'medium'];
  const t = s.turn;
  if (t.rolls === 0) return { a: 'roll' };

  const mod = prof.modules !== 'none' ? moduleMove(s, p, prof.modules) : null;
  if (mod) return mod;

  if (t.rolls < t.maxRolls) {
    const stopEarly = prof.earlyStop && rng() < prof.earlyStop && t.rolls >= 2;
    const target = stopEarly ? t.dice.map(() => true) : prof.lookahead ? bestHold(p, t.dice, t.locked) : simpleHold(t.dice, t.locked);
    if (!target.every(Boolean)) {
      const diff = target.findIndex((h, i) => h !== t.held[i] && !t.locked[i]);
      if (diff >= 0) return { a: 'hold', i: diff };
      return { a: 'roll' };
    }
  }
  const c = bestChoice(p, t.dice, prof.noise, rng);
  return { a: 'score', col: c.col, cat: c.cat };
}

function moduleMove(s: GameState, p: Player, level: 'basic' | 'full'): PlayerAction | null {
  const t = s.turn;
  const c = counts(t.dice);
  const free = freeCells(p);
  const isFree = (cat: Cat) => free.some((f) => f.cat === cat);
  if (level === 'full') {
    // Vier Gleiche → mit Joker zu 5 Gleichen
    const quad = [1, 2, 3, 4, 5, 6].find((v) => c[v] === 4);
    if (quad && isFree('fiveKind') && !canUseModule(s, p, 'joker')) {
      const i = t.dice.findIndex((d, k) => d !== quad && !t.locked[k]);
      if (i >= 0) return { a: 'mod', id: 'joker', i, v: quad };
    }
    // Ein Würfel ±1 neben der Großen Straße
    if (isFree('largeStraight') && !score(t.dice, 'largeStraight') && !canUseModule(s, p, 'nudge')) {
      for (let i = 0; i < t.dice.length; i++) {
        if (t.locked[i]) continue;
        for (const d of [1, -1] as const) {
          const nv = t.dice[i] + d;
          if (nv < 1 || nv > 6) continue;
          const test = t.dice.slice();
          test[i] = nv;
          if (score(test, 'largeStraight')) return { a: 'mod', id: 'nudge', i, d };
        }
      }
    }
  }
  if (t.rolls >= t.maxRolls && !canUseModule(s, p, 'reroll')) {
    const best = bestChoice(p, t.dice);
    if (best.v < (level === 'full' ? -6 : -10)) return { a: 'mod', id: 'reroll' };
  }
  return null;
}

/** Bester Vorschlag für die Live-Vorschau (ohne Rauschen). */
export function suggestCell(p: Player, dice: number[]): { col: number; cat: Cat } | null {
  if (!freeCells(p).length) return null;
  const c = bestChoice(p, dice);
  return { col: c.col, cat: c.cat };
}

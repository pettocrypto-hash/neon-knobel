import { RULES } from '../config/rules';

/** Kategorien in Block-Reihenfolge. */
export const CATS = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'pair',
  'twoPairs',
  'three',
  'four',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'fiveKind',
  'chance',
] as const;

export type Cat = (typeof CATS)[number];
export const CAT_COUNT = CATS.length;
export const UPPER: Cat[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER: Cat[] = CATS.filter((c) => !UPPER.includes(c));

export const CAT_LABEL: Record<Cat, string> = {
  ones: 'Einer',
  twos: 'Zweier',
  threes: 'Dreier',
  fours: 'Vierer',
  fives: 'Fünfer',
  sixes: 'Sechser',
  pair: '1 Paar',
  twoPairs: '2 Paar',
  three: 'Drei Gleiche',
  four: 'Vier Gleiche',
  fullHouse: 'Volles Haus',
  smallStraight: 'Kleine Straße',
  largeStraight: 'Große Straße',
  fiveKind: '5 Gleiche',
  chance: 'Chance',
};

export const CAT_SHORT: Record<Cat, string> = {
  ones: 'Einer',
  twos: 'Zweier',
  threes: 'Dreier',
  fours: 'Vierer',
  fives: 'Fünfer',
  sixes: 'Sechser',
  pair: '1 Paar',
  twoPairs: '2 Paar',
  three: '3 Gleiche',
  four: '4 Gleiche',
  fullHouse: 'Full House',
  smallStraight: 'Kl. Straße',
  largeStraight: 'Gr. Straße',
  fiveKind: '5 Gleiche',
  chance: 'Chance',
};

export const CAT_HINT: Record<Cat, string> = {
  ones: 'Summe aller Einsen',
  twos: 'Summe aller Zweien',
  threes: 'Summe aller Dreien',
  fours: 'Summe aller Vieren',
  fives: 'Summe aller Fünfen',
  sixes: 'Summe aller Sechsen',
  pair: 'Mind. 2 gleiche Würfel',
  twoPairs: 'Zwei verschiedene Paare',
  three: 'Mind. 3 gleiche Würfel',
  four: 'Mind. 4 gleiche Würfel',
  fullHouse: '3 + 2 Gleiche',
  smallStraight: '4 Zahlen in Folge',
  largeStraight: '5 Zahlen in Folge',
  fiveKind: 'Alle 5 Würfel gleich',
  chance: 'Summe aller Würfel',
};

export function counts(dice: readonly number[]): number[] {
  const c = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dice) c[d]++;
  return c;
}

export const sum = (dice: readonly number[]) => dice.reduce((a, b) => a + b, 0);

function hasRun(c: number[], len: number): boolean {
  let run = 0;
  for (let v = 1; v <= 6; v++) {
    run = c[v] > 0 ? run + 1 : 0;
    if (run >= len) return true;
  }
  return false;
}

/** Höchster Wert mit mindestens n Würfeln (0 = keiner). */
function topWith(c: number[], n: number): number {
  for (let v = 6; v >= 1; v--) if (c[v] >= n) return v;
  return 0;
}

/** Punkte, die `dice` in Kategorie `cat` bringen (0 = Kombination nicht vorhanden). */
export function score(dice: readonly number[], cat: Cat): number {
  const c = counts(dice);
  const total = sum(dice);
  const all = RULES.PAIR_SCORING === 'all';
  switch (cat) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER.indexOf(cat) + 1;
      return c[face] * face;
    }
    case 'pair': {
      const v = topWith(c, 2);
      return v ? (all ? total : v * 2) : 0;
    }
    case 'twoPairs': {
      const pairs: number[] = [];
      for (let v = 6; v >= 1; v--) if (c[v] >= 2) pairs.push(v);
      if (pairs.length >= 2) return all ? total : (pairs[0] + pairs[1]) * 2;
      const quad = RULES.FOUR_KIND_AS_TWO_PAIRS ? topWith(c, 4) : 0;
      return quad ? (all ? total : quad * 4) : 0;
    }
    case 'three': {
      const v = topWith(c, 3);
      return v ? (all ? total : v * 3) : 0;
    }
    case 'four': {
      const v = topWith(c, 4);
      return v ? (all ? total : v * 4) : 0;
    }
    case 'fullHouse': {
      const sorted = c.slice(1).filter((n) => n > 0).sort();
      if (sorted.length === 2 && sorted[0] === 2 && sorted[1] === 3) return RULES.FULL_HOUSE;
      if (RULES.FIVE_KIND_AS_FULL_HOUSE && topWith(c, 5)) return RULES.FULL_HOUSE;
      return 0;
    }
    case 'smallStraight':
      return hasRun(c, 4) ? RULES.SMALL_STRAIGHT : 0;
    case 'largeStraight':
      return hasRun(c, 5) ? RULES.LARGE_STRAIGHT : 0;
    case 'fiveKind':
      return topWith(c, 5) ? RULES.FIVE_KIND : 0;
    case 'chance':
      return total;
  }
}

export function scoreAll(dice: readonly number[]): Record<Cat, number> {
  const out = {} as Record<Cat, number>;
  for (const cat of CATS) out[cat] = score(dice, cat);
  return out;
}

/** Ein eingetragenes Feld. `x` = gestrichen (0 Punkte, durchgestrichen). */
export interface Cell {
  p: number;
  x?: 1;
}
export type Column = (Cell | null)[];

export const emptyColumn = (): Column => Array.from({ length: CAT_COUNT }, () => null);

export interface ColumnSums {
  upperSub: number;
  bonus: number;
  upperTotal: number;
  lowerTotal: number;
  total: number;
  upperDone: boolean;
  done: boolean;
  /** Wie viel bis zum Bonus fehlt (0 wenn erreicht). */
  bonusMissing: number;
}

export function columnSums(col: Column): ColumnSums {
  let upperSub = 0;
  let lowerTotal = 0;
  let upperDone = true;
  let done = true;
  CATS.forEach((cat, i) => {
    const cell = col[i];
    if (!cell) {
      done = false;
      if (UPPER.includes(cat)) upperDone = false;
      return;
    }
    if (UPPER.includes(cat)) upperSub += cell.p;
    else lowerTotal += cell.p;
  });
  const bonus = upperSub >= RULES.UPPER_BONUS_THRESHOLD ? RULES.UPPER_BONUS : 0;
  const upperTotal = upperSub + bonus;
  return {
    upperSub,
    bonus,
    upperTotal,
    lowerTotal,
    total: upperTotal + lowerTotal,
    upperDone,
    done,
    bonusMissing: Math.max(0, RULES.UPPER_BONUS_THRESHOLD - upperSub),
  };
}

export const totalScore = (cols: Column[]) => cols.reduce((a, c) => a + columnSums(c).total, 0);

export const catIndex = (cat: Cat) => CATS.indexOf(cat);

/** "Par"-Werte: ab hier gilt ein Eintrag als guter Zug (Combo-Streak). */
export const PAR: Record<Cat, number> = {
  ones: 3,
  twos: 6,
  threes: 9,
  fours: 12,
  fives: 15,
  sixes: 18,
  pair: 23,
  twoPairs: 21,
  three: 21,
  four: 18,
  fullHouse: 1,
  smallStraight: 1,
  largeStraight: 1,
  fiveKind: 1,
  chance: 24,
};

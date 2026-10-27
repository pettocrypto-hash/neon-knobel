import { describe, expect, it } from 'vitest';
import { RULES } from '../src/config/rules';
import { CATS, CAT_COUNT, columnSums, emptyColumn, score, scoreAll, totalScore, type Cat, type Column } from '../src/game/scoring';

const S = (dice: number[], cat: Cat) => score(dice, cat);

describe('Oberer Teil', () => {
  it('summiert passende Augen', () => {
    expect(S([1, 1, 2, 3, 1], 'ones')).toBe(3);
    expect(S([2, 2, 2, 2, 5], 'twos')).toBe(8);
    expect(S([3, 1, 2, 4, 5], 'threes')).toBe(3);
    expect(S([4, 4, 1, 1, 1], 'fours')).toBe(8);
    expect(S([5, 5, 5, 5, 5], 'fives')).toBe(25);
    expect(S([6, 6, 6, 1, 2], 'sixes')).toBe(18);
  });
  it('gibt 0 ohne passende Würfel', () => {
    expect(S([2, 3, 4, 5, 6], 'ones')).toBe(0);
    expect(S([1, 2, 3, 4, 5], 'sixes')).toBe(0);
  });
});

describe('Paare, Drei und Vier Gleiche (Summe aller Würfel)', () => {
  it('ist so konfiguriert wie auf dem Beispielblock', () => {
    expect(RULES.PAIR_SCORING).toBe('all');
  });
  it('1 Paar', () => {
    expect(S([6, 6, 1, 2, 3], 'pair')).toBe(18);
    expect(S([1, 2, 3, 4, 6], 'pair')).toBe(0);
    expect(S([5, 5, 5, 5, 5], 'pair')).toBe(25);
  });
  it('2 Paar', () => {
    expect(S([6, 6, 5, 5, 3], 'twoPairs')).toBe(25);
    expect(S([6, 6, 5, 4, 3], 'twoPairs')).toBe(0);
    // Volles Haus enthält zwei verschiedene Paare
    expect(S([2, 2, 3, 3, 3], 'twoPairs')).toBe(13);
    // Vier Gleiche zählen als 2 Paar
    expect(S([4, 4, 4, 4, 1], 'twoPairs')).toBe(17);
    expect(S([6, 6, 6, 6, 6], 'twoPairs')).toBe(30);
  });
  it('Drei Gleiche', () => {
    expect(S([3, 3, 3, 6, 6], 'three')).toBe(21);
    expect(S([6, 6, 5, 5, 4], 'three')).toBe(0);
    expect(S([2, 2, 2, 2, 2], 'three')).toBe(10);
  });
  it('Vier Gleiche', () => {
    expect(S([5, 5, 5, 5, 6], 'four')).toBe(26);
    expect(S([5, 5, 5, 6, 6], 'four')).toBe(0);
    expect(S([1, 1, 1, 1, 1], 'four')).toBe(5);
  });
});

describe('Feste Kombinationen', () => {
  it('Volles Haus = 25', () => {
    expect(S([2, 2, 3, 3, 3], 'fullHouse')).toBe(25);
    expect(S([2, 2, 3, 3, 4], 'fullHouse')).toBe(0);
    expect(S([2, 2, 2, 2, 3], 'fullHouse')).toBe(0);
  });
  it('5 Gleiche zählt als Volles Haus', () => {
    expect(RULES.FIVE_KIND_AS_FULL_HOUSE).toBe(true);
    expect(S([4, 4, 4, 4, 4], 'fullHouse')).toBe(25);
  });
  it('Kleine Straße = 30', () => {
    expect(S([1, 2, 3, 4, 6], 'smallStraight')).toBe(30);
    expect(S([3, 4, 5, 6, 6], 'smallStraight')).toBe(30);
    expect(S([2, 3, 4, 5, 2], 'smallStraight')).toBe(30);
    expect(S([1, 2, 3, 4, 5], 'smallStraight')).toBe(30);
    expect(S([1, 2, 3, 5, 6], 'smallStraight')).toBe(0);
  });
  it('Große Straße = 40', () => {
    expect(S([1, 2, 3, 4, 5], 'largeStraight')).toBe(40);
    expect(S([6, 5, 4, 3, 2], 'largeStraight')).toBe(40);
    expect(S([1, 2, 3, 4, 6], 'largeStraight')).toBe(0);
    expect(S([1, 3, 4, 5, 6], 'largeStraight')).toBe(0);
  });
  it('5 Gleiche = 50', () => {
    expect(S([6, 6, 6, 6, 6], 'fiveKind')).toBe(50);
    expect(S([6, 6, 6, 6, 5], 'fiveKind')).toBe(0);
  });
  it('Chance = Summe', () => {
    expect(S([1, 1, 1, 1, 1], 'chance')).toBe(5);
    expect(S([6, 6, 6, 6, 6], 'chance')).toBe(30);
    expect(S([1, 2, 3, 4, 5], 'chance')).toBe(15);
  });
  it('scoreAll liefert alle Kategorien', () => {
    const all = scoreAll([3, 3, 3, 3, 3]);
    expect(Object.keys(all)).toHaveLength(CAT_COUNT);
    expect(all.fiveKind).toBe(50);
    expect(all.threes).toBe(15);
    expect(all.largeStraight).toBe(0);
  });
});

function fill(values: Partial<Record<Cat, number>>): Column {
  const col = emptyColumn();
  for (const [cat, p] of Object.entries(values)) col[CATS.indexOf(cat as Cat)] = p ? { p } : { p: 0, x: 1 };
  return col;
}

describe('Summen und Bonus', () => {
  it('Bonus genau ab 63', () => {
    const c63 = fill({ ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(columnSums(c63).upperSub).toBe(63);
    expect(columnSums(c63).bonus).toBe(35);
    expect(columnSums(c63).upperTotal).toBe(98);
    const c62 = fill({ ones: 2, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 });
    expect(columnSums(c62).bonus).toBe(0);
    expect(columnSums(c62).bonusMissing).toBe(1);
  });
  it('Gestrichene Felder zählen 0 und gelten als belegt', () => {
    const col = fill({ ones: 0, fiveKind: 0, chance: 22 });
    const s = columnSums(col);
    expect(s.total).toBe(22);
    expect(col[0]).toEqual({ p: 0, x: 1 });
    expect(s.done).toBe(false);
  });
  it('Endsumme = Teil 1 + Teil 2, Marathon summiert alle Spalten', () => {
    const full = fill({
      ones: 3, twos: 6, threes: 12, fours: 12, fives: 15, sixes: 18,
      pair: 26, twoPairs: 22, three: 24, four: 29, fullHouse: 25, smallStraight: 30, largeStraight: 40, fiveKind: 50, chance: 23,
    });
    const s = columnSums(full);
    expect(s.upperSub).toBe(66);
    expect(s.upperTotal).toBe(101);
    expect(s.lowerTotal).toBe(269);
    expect(s.total).toBe(370);
    expect(s.done).toBe(true);
    expect(totalScore([full, full, emptyColumn()])).toBe(740);
  });
});

import { describe, expect, it } from 'vitest';
import { ENERGY } from '../src/config/rules';
import { botStep } from '../src/game/bot';
import { addBot, applyAction, autoMove, createRoom, currentPlayer, joinPlayer, makePlayer, turnsPerPlayer, type Rng } from '../src/game/engine';
import { CATS, columnSums, totalScore } from '../src/game/scoring';
import type { GameConfig, GameState } from '../src/game/types';

/** Deterministischer Zufall für reproduzierbare Tests. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const look = { skin: 'neon', frame: 'basic', level: 1 };

function room(config: Partial<GameConfig> = {}): GameState {
  return createRoom('ABCD', makePlayer('host', 'Host', look), { mode: 'classic', modules: true, turnSeconds: 0, ...config });
}

/** Spielt eine Partie komplett mit Bots durch (auch der Host wird als Bot gesteuert). */
function playOut(s: GameState, rng: Rng) {
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 50000) {
    const p = currentPlayer(s);
    const act = botStep({ ...s, players: s.players.map((x) => (x.id === p.id ? { ...x, bot: x.bot ?? 'hard' } : x)) } as GameState, rng);
    const r = applyAction(s, p.id, act, rng);
    if (!r.ok) throw new Error(`${p.name}: ${JSON.stringify(act)} → ${r.err}`);
  }
  return guard;
}

describe('Lobby', () => {
  it('Beitritt, Reconnect und volle Lobby', () => {
    const s = room();
    expect(joinPlayer(s, 'g1', 'Gast', look).ok).toBe(true);
    expect(s.players).toHaveLength(2);
    // Reconnect mit gleicher ID erzeugt keinen neuen Platz
    expect(joinPlayer(s, 'g1', 'Gast', look).ok).toBe(true);
    expect(s.players).toHaveLength(2);
    addBot(s, 'easy');
    addBot(s, 'hard');
    expect(joinPlayer(s, 'g2', 'Zu spät', look).ok).toBe(false);
  });
  it('Start erst, wenn alle bereit sind – und nur durch den Host', () => {
    const s = room();
    joinPlayer(s, 'g1', 'Gast', look);
    expect(applyAction(s, 'host', { a: 'start' }, seeded(1)).ok).toBe(false);
    expect(applyAction(s, 'g1', { a: 'ready', on: true }, seeded(1)).ok).toBe(true);
    expect(applyAction(s, 'g1', { a: 'start' }, seeded(1)).ok).toBe(false);
    expect(applyAction(s, 'host', { a: 'start' }, seeded(1)).ok).toBe(true);
    expect(s.phase).toBe('playing');
    expect(joinPlayer(s, 'g9', 'Neu', look).ok).toBe(false);
  });
});

describe('Zugregeln', () => {
  it('Würfeln, Halten, maximal 3 Würfe, falscher Spieler wird abgelehnt', () => {
    const s = room();
    joinPlayer(s, 'g1', 'Gast', look);
    applyAction(s, 'g1', { a: 'ready', on: true }, seeded(2));
    applyAction(s, 'host', { a: 'start' }, seeded(2));
    const me = currentPlayer(s).id;
    const other = me === 'host' ? 'g1' : 'host';
    const rng = seeded(3);
    expect(applyAction(s, other, { a: 'roll' }, rng).ok).toBe(false);
    expect(applyAction(s, me, { a: 'hold', i: 0 }, rng).ok).toBe(false); // vor dem ersten Wurf
    expect(applyAction(s, me, { a: 'score', col: 0, cat: 'chance' }, rng).ok).toBe(false);
    expect(applyAction(s, me, { a: 'roll' }, rng).ok).toBe(true);
    applyAction(s, me, { a: 'hold', i: 0 }, rng);
    const kept = s.turn.dice[0];
    applyAction(s, me, { a: 'roll' }, rng);
    expect(s.turn.dice[0]).toBe(kept);
    applyAction(s, me, { a: 'roll' }, rng);
    expect(applyAction(s, me, { a: 'roll' }, rng).ok).toBe(false);
    expect(applyAction(s, me, { a: 'score', col: 0, cat: 'chance' }, rng).ok).toBe(true);
    expect(currentPlayer(s).id).toBe(other);
  });

  it('Streichen trägt 0 ein und markiert das Feld', () => {
    const s = room();
    applyAction(s, 'host', { a: 'start' }, seeded(4));
    s.turn.rolls = 1;
    s.turn.dice = [1, 2, 3, 5, 6];
    expect(applyAction(s, 'host', { a: 'score', col: 0, cat: 'fiveKind' }, seeded(4)).ok).toBe(true);
    expect(s.players[0].cols[0][CATS.indexOf('fiveKind')]).toEqual({ p: 0, x: 1 });
    expect(s.players[0].stats.scratches).toBe(1);
    // Belegtes Feld kann nicht erneut gewählt werden
    s.turn.rolls = 1;
    expect(applyAction(s, 'host', { a: 'score', col: 0, cat: 'fiveKind' }, seeded(4)).ok).toBe(false);
  });

  it('Module kosten Energie und wirken', () => {
    const s = room();
    applyAction(s, 'host', { a: 'start' }, seeded(5));
    const p = s.players[0];
    s.turn.rolls = 3;
    s.turn.dice = [4, 4, 4, 4, 2];
    expect(applyAction(s, 'host', { a: 'mod', id: 'joker', i: 4, v: 4 }, seeded(5)).ok).toBe(false); // keine Energie
    p.energy = 100;
    expect(applyAction(s, 'host', { a: 'mod', id: 'joker', i: 4, v: 4 }, seeded(5)).ok).toBe(true);
    expect(s.turn.dice).toEqual([4, 4, 4, 4, 4]);
    expect(p.energy).toBe(100 - ENERGY.MODULES.joker.cost);
    expect(applyAction(s, 'host', { a: 'mod', id: 'joker', i: 0, v: 1 }, seeded(5)).ok).toBe(false); // 1x pro Zug
    expect(applyAction(s, 'host', { a: 'mod', id: 'reroll' }, seeded(5)).ok).toBe(true);
    expect(s.turn.maxRolls).toBe(4);
    expect(applyAction(s, 'host', { a: 'mod', id: 'nudge', i: 0, d: 1 }, seeded(5)).ok).toBe(false); // zu wenig Energie (5 übrig)
  });

  it('Freeze nimmt den Würfel in den nächsten Zug mit', () => {
    const s = room();
    applyAction(s, 'host', { a: 'start' }, seeded(6));
    const p = s.players[0];
    p.energy = 50;
    s.turn.rolls = 1;
    s.turn.dice = [6, 1, 2, 3, 3];
    expect(applyAction(s, 'host', { a: 'mod', id: 'freeze', i: 0 }, seeded(6)).ok).toBe(true);
    expect(applyAction(s, 'host', { a: 'hold', i: 0 }, seeded(6)).ok).toBe(false); // gesperrt
    applyAction(s, 'host', { a: 'roll' }, seeded(6));
    expect(s.turn.dice[0]).toBe(6);
    applyAction(s, 'host', { a: 'score', col: 0, cat: 'chance' }, seeded(6));
    // Solo: nächster Zug gehört wieder dem Host
    expect(s.turn.dice[0]).toBe(6);
    expect(s.turn.locked[0]).toBe(true);
    applyAction(s, 'host', { a: 'roll' }, seeded(7));
    expect(s.turn.dice[0]).toBe(6);
  });

  it('Ungültige Eingaben von Gästen werden abgelehnt', () => {
    const s = room();
    joinPlayer(s, 'g1', 'Gast', look);
    applyAction(s, 'g1', { a: 'ready', on: true }, seeded(12));
    applyAction(s, 'host', { a: 'start' }, seeded(12));
    const me = currentPlayer(s);
    me.energy = 100;
    s.turn.rolls = 1;
    const bad = (act: unknown) => applyAction(s, me.id, act as never, seeded(12)).ok;
    expect(bad({ a: 'score', col: '__proto__', cat: 'chance' })).toBe(false);
    expect(bad({ a: 'score', col: 1, cat: 'chance' })).toBe(false);
    expect(bad({ a: 'score', col: 0.5, cat: 'chance' })).toBe(false);
    expect(bad({ a: 'score', col: 0, cat: 'jackpot' })).toBe(false);
    expect(bad({ a: 'mod', id: 'laser' })).toBe(false);
    expect(bad({ a: 'nonsense' })).toBe(false);
    expect(bad(null)).toBe(false);
    expect(bad({ a: 'addBot', level: 'godlike' })).toBe(false);
    // Gast kann keine Host-Aktionen auslösen
    const other = s.players.find((p) => p.id !== s.hostId)!;
    expect(applyAction(s, other.id, { a: 'kick', pid: s.hostId }, seeded(12)).ok).toBe(false);
    expect(([] as unknown as Record<number, unknown>)[14]).toBeUndefined();
    // Eingefrorene Würfel lassen sich nicht per Nudge/Joker ändern
    s.turn.dice = [2, 3, 4, 5, 6];
    expect(applyAction(s, me.id, { a: 'mod', id: 'freeze', i: 0 }, seeded(12)).ok).toBe(true);
    expect(applyAction(s, me.id, { a: 'mod', id: 'joker', i: 0, v: 6 }, seeded(12)).ok).toBe(false);
  });

  it('Bonus-Grenze 63 und Energie für den Bonus', () => {
    const s = room();
    applyAction(s, 'host', { a: 'start' }, seeded(8));
    const p = s.players[0];
    const set = (dice: number[], cat: (typeof CATS)[number]) => {
      s.turn.rolls = 1;
      s.turn.dice = dice;
      expect(applyAction(s, 'host', { a: 'score', col: 0, cat }, seeded(8)).ok).toBe(true);
    };
    set([1, 1, 1, 2, 3], 'ones');
    set([2, 2, 2, 1, 3], 'twos');
    set([3, 3, 3, 1, 2], 'threes');
    set([4, 4, 4, 1, 2], 'fours');
    set([5, 5, 5, 1, 2], 'fives');
    const before = p.energy;
    set([6, 6, 6, 1, 2], 'sixes');
    expect(columnSums(p.cols[0]).bonus).toBe(35);
    expect(p.energy).toBeGreaterThan(before);
    expect(p.stats.bonusCols).toBe(1);
  });
});

describe('Komplette Partien mit Bots', () => {
  it('Klassik mit 4 Spielern endet korrekt', () => {
    const rng = seeded(42);
    const s = room();
    addBot(s, 'easy', rng);
    addBot(s, 'medium', rng);
    addBot(s, 'hard', rng);
    applyAction(s, 'host', { a: 'start' }, rng);
    playOut(s, rng);
    expect(s.phase).toBe('over');
    for (const p of s.players) {
      expect(p.cols[0].every(Boolean)).toBe(true);
      expect(totalScore(p.cols)).toBeGreaterThan(50);
    }
    expect(s.turnNo).toBe(turnsPerPlayer(s) * 4);
  });

  it('Marathon (7 Spalten) mit 2 Spielern und freier Spaltenwahl', () => {
    const rng = seeded(7);
    const s = room({ mode: 'marathon' });
    addBot(s, 'hard', rng);
    applyAction(s, 'host', { a: 'start' }, rng);
    expect(s.players[0].cols).toHaveLength(7);
    playOut(s, rng);
    expect(s.phase).toBe('over');
    for (const p of s.players) expect(p.cols.flat().every(Boolean)).toBe(true);
    expect(turnsPerPlayer(s)).toBe(7 * CATS.length);
  });

  it('Schwerer Bot schlägt im Schnitt den leichten', () => {
    let hard = 0;
    let easy = 0;
    for (let g = 0; g < 12; g++) {
      const rng = seeded(100 + g);
      const s = createRoom('X', makePlayer('bot-a', 'A', look, 'hard'), { mode: 'classic', modules: false, turnSeconds: 0 });
      s.players[0].bot = 'hard';
      addBot(s, 'easy', rng);
      applyAction(s, 'bot-a', { a: 'start' }, rng);
      playOut(s, rng);
      hard += totalScore(s.players[0].cols);
      easy += totalScore(s.players[1].cols);
    }
    expect(hard).toBeGreaterThan(easy);
  });

  it('Zugtimer-Automatik trägt ein', () => {
    const s = room({ turnSeconds: 30 });
    applyAction(s, 'host', { a: 'start' }, seeded(9));
    expect(s.turn.deadline).toBeGreaterThan(0);
    expect(autoMove(s, seeded(9)).ok).toBe(true);
    expect(s.players[0].cols[0].filter(Boolean)).toHaveLength(1);
  });

  it('Revanche setzt den Block zurück', () => {
    const rng = seeded(11);
    const s = room();
    addBot(s, 'easy', rng);
    applyAction(s, 'host', { a: 'start' }, rng);
    playOut(s, rng);
    expect(applyAction(s, 'host', { a: 'rematch' }, rng).ok).toBe(true);
    expect(s.phase).toBe('playing');
    expect(s.gameNo).toBe(2);
    expect(s.players.every((p) => p.cols[0].every((c) => c === null))).toBe(true);
  });
});

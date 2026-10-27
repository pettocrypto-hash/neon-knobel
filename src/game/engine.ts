import { ENERGY, MODULE_IDS, RULES, type ModuleId } from '../config/rules';
import { CATS, PAR, UPPER, catIndex, columnSums, counts, emptyColumn, score, totalScore, type Cat } from './scoring';
import type { Action, BotLevel, GameConfig, GameEventBody, GameState, Look, Player, PlayerStats, Result, Turn } from './types';

/**
 * Autoritative Spiellogik. Läuft ausschließlich beim Host ("Server"):
 * Würfeln, Zugreihenfolge, Gültigkeit und Punkte. Clients senden nur Wünsche.
 */

export type Rng = () => number;

export const cryptoRng: Rng = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
};

export const rollDie = (rng: Rng) => 1 + Math.floor(rng() * 6);

const MAX_EVENTS = 40;

export const BOT_NAMES = ['NOVA', 'GLITCH', 'VEKTOR', 'ECHO', 'PIXEL', 'ZERO', 'QUASAR', 'NEXUS'];
export const BOT_LABEL: Record<BotLevel, string> = { easy: 'Leicht', medium: 'Mittel', hard: 'Schwer' };

const emptyStats = (): PlayerStats => ({
  fiveKinds: 0,
  fiveKindFirst: 0,
  largeStraights: 0,
  largeFirst: 0,
  smallStraights: 0,
  fullHouses: 0,
  bonusCols: 0,
  perfectCols: 0,
  scratches: 0,
  modules: 0,
  bestStreak: 0,
  nearMisses: 0,
  chance5: 0,
  catPoints: {},
});

const freshTurn = (): Turn => ({
  dice: [1, 2, 3, 4, 5],
  held: [false, false, false, false, false],
  locked: [false, false, false, false, false],
  rolls: 0,
  maxRolls: RULES.MAX_ROLLS,
  used: {},
  frozen: -1,
  deadline: 0,
});

const zeroUses = (): Record<ModuleId, number> => ({ reroll: 0, nudge: 0, freeze: 0, joker: 0 });

export function makePlayer(id: string, name: string, look: Look, bot?: BotLevel): Player {
  return {
    id,
    name: name.slice(0, 14) || 'Spieler',
    bot,
    connected: true,
    ready: !!bot,
    look,
    cols: [emptyColumn()],
    energy: 0,
    uses: zeroUses(),
    streak: 0,
    carry: null,
    stats: emptyStats(),
  };
}

export function createRoom(room: string, host: Player, config: GameConfig): GameState {
  host.ready = true;
  return {
    v: 1,
    room,
    gameNo: 0,
    phase: 'lobby',
    config,
    hostId: host.id,
    players: [host],
    cur: 0,
    turnNo: 0,
    turn: freshTurn(),
    events: [],
    seq: 0,
    startedAt: 0,
    endedAt: 0,
    halfStand: null,
  };
}

export function emit(s: GameState, e: GameEventBody) {
  s.seq++;
  s.events.push({ ...e, seq: s.seq } as GameState['events'][number]);
  if (s.events.length > MAX_EVENTS) s.events.splice(0, s.events.length - MAX_EVENTS);
}

export const columnsFor = (s: GameState) => RULES.COLUMNS[s.config.mode];
export const turnsPerPlayer = (s: GameState) => columnsFor(s) * CATS.length;
export const currentPlayer = (s: GameState) => s.players[s.cur];

export function freeBotName(s: GameState): string {
  const used = new Set(s.players.map((p) => p.name));
  return BOT_NAMES.find((n) => !used.has(n)) ?? `BOT ${s.players.length + 1}`;
}

export function addBot(s: GameState, level: BotLevel, rng: Rng = cryptoRng): Result {
  if (s.phase !== 'lobby') return fail('Nur in der Lobby möglich.');
  if (s.players.length >= RULES.MAX_PLAYERS) return fail('Die Lobby ist voll.');
  const skins = ['neon', 'holo', 'crystal', 'glitch', 'lava', 'ice'];
  const id = `bot-${Math.floor(rng() * 1e9).toString(36)}`;
  s.players.push(makePlayer(id, freeBotName(s), { skin: skins[Math.floor(rng() * skins.length)], frame: 'basic', level: 1 }, level));
  return OK;
}

/** Spieler betritt die Lobby oder kehrt zurück (Reconnect per ID). */
export function joinPlayer(s: GameState, id: string, name: string, look: Look): Result {
  const existing = s.players.find((p) => p.id === id);
  if (existing) {
    existing.connected = true;
    if (existing.standIn) {
      existing.bot = undefined;
      existing.standIn = false;
    }
    existing.look = look;
    if (s.phase === 'lobby') existing.name = name.slice(0, 14) || existing.name;
    return OK;
  }
  if (s.phase !== 'lobby') return fail('Das Spiel läuft bereits.');
  if (s.players.length >= RULES.MAX_PLAYERS) return fail('Die Lobby ist voll.');
  s.players.push(makePlayer(id, name, look));
  return OK;
}

export function startGame(s: GameState, rng: Rng, now = Date.now()): Result {
  if (s.phase === 'playing') return fail('Das Spiel läuft bereits.');
  const nCols = RULES.COLUMNS[s.config.mode];
  for (const p of s.players) {
    p.cols = Array.from({ length: nCols }, emptyColumn);
    p.energy = 0;
    p.uses = zeroUses();
    p.streak = 0;
    p.carry = null;
    p.stats = emptyStats();
  }
  s.gameNo++;
  s.phase = 'playing';
  s.cur = Math.floor(rng() * s.players.length);
  s.turnNo = 0;
  s.startedAt = now;
  s.endedAt = 0;
  s.halfStand = null;
  emit(s, { type: 'start' });
  beginTurn(s, now);
  return OK;
}

function beginTurn(s: GameState, now: number) {
  const p = currentPlayer(s);
  const t = freshTurn();
  if (p.carry) {
    t.dice[0] = p.carry;
    t.held[0] = true;
    t.locked[0] = true;
    p.carry = null;
  }
  t.deadline = s.config.turnSeconds ? now + s.config.turnSeconds * 1000 : 0;
  s.turn = t;
  emit(s, { type: 'turn', pid: p.id });
}

const OK: Result = { ok: true };
const fail = (err: string): Result => ({ ok: false, err });

export function canUseModule(s: GameState, p: Player, id: ModuleId): string | null {
  if (!s.config.modules) return 'Module sind in dieser Partie aus (Purist-Modus).';
  const m = ENERGY.MODULES[id];
  if (s.turn.used[id]) return 'Dieses Modul wurde in diesem Zug schon genutzt.';
  if (p.uses[id] >= ENERGY.USES[s.config.mode][id]) return 'Keine Einsätze mehr übrig.';
  if (p.energy < m.cost) return `Zu wenig Energie (${m.cost} nötig).`;
  if (s.turn.rolls === 0) return 'Erst würfeln.';
  return null;
}

/** Wendet eine Aktion eines Spielers an (alle Prüfungen inklusive). */
export function applyAction(s: GameState, pid: string, act: Action, rng: Rng, now = Date.now()): Result {
  if (!act || typeof act !== 'object' || typeof act.a !== 'string') return fail('Ungültige Aktion.');
  const isHost = pid === s.hostId;
  switch (act.a) {
    case 'ready': {
      const p = s.players.find((x) => x.id === pid);
      if (!p || s.phase !== 'lobby') return fail('Nicht möglich.');
      p.ready = act.on || pid === s.hostId;
      return OK;
    }
    case 'config': {
      if (!isHost || s.phase !== 'lobby') return fail('Nur der Host kann das ändern.');
      const c = act.config;
      if (c.mode === 'classic' || c.mode === 'marathon') s.config.mode = c.mode;
      if (typeof c.modules === 'boolean') s.config.modules = c.modules;
      if (typeof c.turnSeconds === 'number' && (RULES.TURN_TIMERS as readonly number[]).includes(c.turnSeconds)) s.config.turnSeconds = c.turnSeconds;
      return OK;
    }
    case 'addBot':
      if (!isHost) return fail('Nur der Host kann Bots hinzufügen.');
      if (!['easy', 'medium', 'hard'].includes(act.level)) return fail('Ungültige Stufe.');
      return addBot(s, act.level, rng);
    case 'kick': {
      if (!isHost || s.phase !== 'lobby' || act.pid === s.hostId) return fail('Nicht möglich.');
      s.players = s.players.filter((p) => p.id !== act.pid);
      return OK;
    }
    case 'start': {
      if (!isHost || s.phase !== 'lobby') return fail('Nur der Host kann starten.');
      if (s.players.some((p) => !p.ready)) return fail('Noch nicht alle sind bereit.');
      return startGame(s, rng, now);
    }
    case 'rematch': {
      if (!isHost || s.phase !== 'over') return fail('Nur der Host kann eine Revanche starten.');
      return startGame(s, rng, now);
    }
    case 'takeover': {
      const t = s.players.find((x) => x.id === act.pid);
      if (!isHost || !t || t.bot || t.connected || s.phase !== 'playing') return fail('Nicht möglich.');
      t.bot = 'medium';
      t.standIn = true;
      return OK;
    }
    case 'toLobby': {
      if (!isHost || s.phase !== 'over') return fail('Nicht möglich.');
      s.phase = 'lobby';
      for (const p of s.players) p.ready = !!p.bot || p.id === s.hostId;
      return OK;
    }
  }

  // Ab hier: Spielzüge
  if (s.phase !== 'playing') return fail('Es läuft gerade kein Spiel.');
  const p = currentPlayer(s);
  if (p.id !== pid) return fail('Du bist nicht dran.');
  const t = s.turn;

  switch (act.a) {
    case 'roll': {
      if (t.rolls >= t.maxRolls) return fail('Keine Würfe mehr übrig.');
      if (t.rolls > 0 && t.held.every(Boolean)) return fail('Alle Würfel sind gehalten.');
      const heldBefore = t.held.slice();
      for (let i = 0; i < RULES.DICE; i++) if (!t.held[i]) t.dice[i] = rollDie(rng);
      t.rolls++;
      emit(s, { type: 'roll', pid, dice: t.dice.slice(), held: heldBefore, rolls: t.rolls });
      return OK;
    }
    case 'hold': {
      const i = act.i;
      if (!Number.isInteger(i) || i < 0 || i >= RULES.DICE) return fail('Ungültiger Würfel.');
      if (t.rolls === 0) return fail('Erst würfeln.');
      if (t.locked[i]) return fail('Dieser Würfel ist eingefroren.');
      t.held[i] = !t.held[i];
      emit(s, { type: 'hold', pid, held: t.held.slice() });
      return OK;
    }
    case 'mod':
      return applyModule(s, p, act, now);
    case 'score':
      return applyScore(s, p, act.col, act.cat, now, false);
    default:
      return fail('Unbekannte Aktion.');
  }
}

function applyModule(s: GameState, p: Player, act: Extract<Action, { a: 'mod' }>, _now: number): Result {
  if (!MODULE_IDS.includes(act.id)) return fail('Unbekanntes Modul.');
  const err = canUseModule(s, p, act.id);
  if (err) return fail(err);
  const t = s.turn;
  const i = act.i ?? -1;
  const validDie = Number.isInteger(i) && i >= 0 && i < RULES.DICE;
  if ((act.id === 'nudge' || act.id === 'joker') && validDie && t.locked[i]) return fail('Eingefrorene Würfel lassen sich nicht ändern.');
  switch (act.id) {
    case 'reroll':
      t.maxRolls++;
      break;
    case 'nudge': {
      if (!validDie) return fail('Ungültiger Würfel.');
      const nv = t.dice[i] + (act.d === -1 ? -1 : 1);
      if (nv < 1 || nv > 6) return fail('Außerhalb von 1 bis 6.');
      t.dice[i] = nv;
      break;
    }
    case 'freeze':
      if (!validDie) return fail('Ungültiger Würfel.');
      if (t.locked[i]) return fail('Schon eingefroren.');
      t.locked[i] = true;
      t.held[i] = true;
      t.frozen = i;
      break;
    case 'joker': {
      if (!validDie) return fail('Ungültiger Würfel.');
      const v = act.v ?? 0;
      if (!Number.isInteger(v) || v < 1 || v > 6) return fail('Ungültige Augenzahl.');
      t.dice[i] = v;
      break;
    }
  }
  p.energy -= ENERGY.MODULES[act.id].cost;
  p.uses[act.id]++;
  p.stats.modules++;
  t.used[act.id] = true;
  emit(s, { type: 'module', pid: p.id, id: act.id, die: validDie ? i : undefined, value: validDie ? t.dice[i] : undefined });
  return OK;
}

export function applyScore(s: GameState, p: Player, col: number, cat: Cat, now: number, auto: boolean): Result {
  const t = s.turn;
  if (t.rolls === 0) return fail('Erst würfeln.');
  if (!Number.isInteger(col) || col < 0 || col >= p.cols.length) return fail('Ungültige Spalte.');
  const column = p.cols[col];
  const ci = catIndex(cat);
  if (ci < 0) return fail('Ungültiges Feld.');
  if (column[ci]) return fail('Dieses Feld ist schon belegt.');

  const before = columnSums(column);
  const pts = score(t.dice, cat);
  column[ci] = pts > 0 ? { p: pts } : { p: 0, x: 1 };
  const after = columnSums(column);
  const firstRoll = t.rolls === 1;
  const c = counts(t.dice);

  // Statistik
  const st = p.stats;
  if (pts > 0) st.catPoints[cat] = (st.catPoints[cat] ?? 0) + pts;
  else st.scratches++;
  if (cat === 'fiveKind' && pts) {
    st.fiveKinds++;
    if (firstRoll) st.fiveKindFirst++;
  }
  if (cat === 'largeStraight' && pts) {
    st.largeStraights++;
    if (firstRoll) st.largeFirst++;
  }
  if (cat === 'smallStraight' && pts) st.smallStraights++;
  if (cat === 'fullHouse' && pts) st.fullHouses++;
  if (cat === 'chance' && pts === 5) st.chance5++;

  // Energie und Streak
  const G = ENERGY.GAIN;
  let gain = 0;
  if (pts > 0) {
    if (cat === 'fiveKind') gain += G.fiveKind;
    else if (cat === 'largeStraight') gain += G.largeStraight;
    else if (cat === 'smallStraight') gain += G.smallStraight;
    else if (cat === 'fullHouse') gain += G.fullHouse;
    else if (cat === 'four') gain += G.four;
    else if (UPPER.includes(cat) && c[UPPER.indexOf(cat) + 1] >= 4) gain += G.upperStrong;
  }
  const bonus = !before.bonus && !!after.bonus;
  if (bonus) {
    gain += G.bonus;
    st.bonusCols++;
  }
  const colDone = after.done;
  if (colDone) {
    if (s.config.mode === 'marathon') gain += G.columnDone;
    if (after.bonus && column.every((cell) => cell && !cell.x)) st.perfectCols++;
  }
  const good = pts > 0 && pts >= PAR[cat];
  p.streak = good ? p.streak + 1 : 0;
  st.bestStreak = Math.max(st.bestStreak, p.streak);
  if (p.streak >= 3) gain += G.streak;
  const before_e = p.energy;
  p.energy = Math.min(ENERGY.MAX, p.energy + gain);

  // Freeze: der in diesem Zug eingefrorene Würfel startet den nächsten Zug.
  p.carry = t.frozen >= 0 ? t.dice[t.frozen] : null;

  emit(s, { type: 'score', pid: p.id, col, cat, p: pts, x: pts === 0, bonus, colDone, energy: p.energy - before_e, streak: p.streak, good, firstRoll, auto });

  // Beinahe-Momente
  const maxC = Math.max(...c.slice(1));
  const fiveFree = p.cols.some((cl) => !cl[catIndex('fiveKind')]);
  const largeFree = p.cols.some((cl) => !cl[catIndex('largeStraight')]);
  if (maxC === 4 && cat !== 'fiveKind' && fiveFree) near(s, p, 'five', 4);
  else if (score(t.dice, 'smallStraight') && !score(t.dice, 'largeStraight') && largeFree && cat !== 'smallStraight') near(s, p, 'large', 4);
  if (after.upperDone && !before.upperDone && !after.bonus && after.bonusMissing <= 4) near(s, p, 'bonus', after.bonusMissing);

  advance(s, now);
  return OK;
}

function near(s: GameState, p: Player, kind: 'five' | 'large' | 'bonus', detail: number) {
  p.stats.nearMisses++;
  emit(s, { type: 'near', pid: p.id, kind, detail });
}

function advance(s: GameState, now: number) {
  s.turnNo++;
  const total = turnsPerPlayer(s) * s.players.length;
  if (!s.halfStand && s.turnNo >= Math.floor(total / 2)) s.halfStand = ranking(s).map((p) => p.id);
  if (s.turnNo >= total) {
    s.phase = 'over';
    s.endedAt = now;
    s.turn = freshTurn();
    for (const p of s.players) p.ready = !!p.bot || p.id === s.hostId;
    emit(s, { type: 'over' });
    return;
  }
  s.cur = (s.cur + 1) % s.players.length;
  beginTurn(s, now);
}

export function ranking(s: GameState): Player[] {
  return s.players.slice().sort((a, b) => totalScore(b.cols) - totalScore(a.cols));
}

/** Alle freien Felder eines Spielers. */
export function freeCells(p: Player): { col: number; cat: Cat }[] {
  const out: { col: number; cat: Cat }[] = [];
  p.cols.forEach((col, ci) => CATS.forEach((cat, i) => !col[i] && out.push({ col: ci, cat })));
  return out;
}

/** Bestes Feld nach reinen Punkten (Zugtimer-Automatik, Vorschau-Fallback). */
export function greedyCell(p: Player, dice: number[]): { col: number; cat: Cat } {
  let best = freeCells(p)[0];
  let bestV = -Infinity;
  for (const f of freeCells(p)) {
    const pts = score(dice, f.cat);
    // Ohne Punkte lieber billige Felder streichen
    const v = pts > 0 ? pts - PAR[f.cat] * 0.5 : -PAR[f.cat] - (f.cat === 'fiveKind' ? 12 : 0);
    if (v > bestV) {
      bestV = v;
      best = f;
    }
  }
  return best;
}

/** Zugtimer abgelaufen: Host würfelt ggf. und trägt automatisch ein. */
export function autoMove(s: GameState, rng: Rng, now = Date.now()): Result {
  if (s.phase !== 'playing') return fail('Kein Spiel.');
  const p = currentPlayer(s);
  if (s.turn.rolls === 0) applyAction(s, p.id, { a: 'roll' }, rng, now);
  const f = greedyCell(p, s.turn.dice);
  return applyScore(s, p, f.col, f.cat, now, true);
}

export function setConnected(s: GameState, pid: string, on: boolean) {
  const p = s.players.find((x) => x.id === pid);
  if (p) p.connected = on;
}

export const moduleIds = MODULE_IDS;

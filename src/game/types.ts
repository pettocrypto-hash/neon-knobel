import type { ModuleId } from '../config/rules';
import type { Cat, Column } from './scoring';

export type Mode = 'classic' | 'marathon';
export type BotLevel = 'easy' | 'medium' | 'hard';
export type Phase = 'lobby' | 'playing' | 'over';

export interface GameConfig {
  mode: Mode;
  /** false = Purist-Modus ohne Module. */
  modules: boolean;
  /** 0 = kein Zugtimer. */
  turnSeconds: number;
}

/** Kosmetik, die ein Spieler mitbringt (lokal freigeschaltet). */
export interface Look {
  skin: string;
  frame: string;
  level: number;
}

export interface PlayerStats {
  fiveKinds: number;
  fiveKindFirst: number;
  largeStraights: number;
  largeFirst: number;
  smallStraights: number;
  fullHouses: number;
  bonusCols: number;
  perfectCols: number;
  scratches: number;
  modules: number;
  bestStreak: number;
  nearMisses: number;
  chance5: number;
  /** Punkte je Kategorie (für Lieblings-Kategorie). */
  catPoints: Partial<Record<Cat, number>>;
}

export interface Player {
  /** Client-ID (zugleich Reconnect-Token) bzw. "bot-…". */
  id: string;
  name: string;
  bot?: BotLevel;
  /** Mensch, der gerade von einem Bot vertreten wird. */
  standIn?: boolean;
  connected: boolean;
  ready: boolean;
  look: Look;
  cols: Column[];
  energy: number;
  uses: Record<ModuleId, number>;
  streak: number;
  /** Per Freeze in den nächsten Zug mitgenommener Würfelwert. */
  carry: number | null;
  stats: PlayerStats;
}

export interface Turn {
  dice: number[];
  held: boolean[];
  /** Per Freeze gesperrt (nicht lösbar). */
  locked: boolean[];
  /** Bereits gewürfelt. */
  rolls: number;
  maxRolls: number;
  used: Partial<Record<ModuleId, true>>;
  /** In diesem Zug per Freeze gesperrter Würfel (-1 = keiner). */
  frozen: number;
  /** Zeitstempel (ms) für den Zugtimer, 0 = aus. */
  deadline: number;
}

export type GameEvent = { seq: number } & (
  | { type: 'roll'; pid: string; dice: number[]; held: boolean[]; rolls: number }
  | { type: 'hold'; pid: string; held: boolean[] }
  | {
      type: 'score';
      pid: string;
      col: number;
      cat: Cat;
      p: number;
      x: boolean;
      bonus: boolean;
      colDone: boolean;
      energy: number;
      streak: number;
      good: boolean;
      firstRoll: boolean;
      auto: boolean;
    }
  | { type: 'module'; pid: string; id: ModuleId; die?: number; value?: number }
  | { type: 'near'; pid: string; kind: 'five' | 'large' | 'bonus'; detail: number }
  | { type: 'turn'; pid: string }
  | { type: 'start' }
  | { type: 'over' }
);

export type GameEventBody = GameEvent extends infer E ? (E extends { seq: number } ? Omit<E, 'seq'> : never) : never;

export interface GameState {
  v: 1;
  room: string;
  /** Partienummer im Raum (Revanche zählt hoch). */
  gameNo: number;
  phase: Phase;
  config: GameConfig;
  hostId: string;
  players: Player[];
  cur: number;
  /** Laufender Zug über alle Spieler (0-basiert). */
  turnNo: number;
  turn: Turn;
  events: GameEvent[];
  seq: number;
  startedAt: number;
  endedAt: number;
  /** Rangfolge (Spieler-IDs) zur Halbzeit – für "Comeback". */
  halfStand: string[] | null;
}

export type PlayerAction =
  | { a: 'roll' }
  | { a: 'hold'; i: number }
  | { a: 'score'; col: number; cat: Cat }
  | { a: 'mod'; id: ModuleId; i?: number; d?: 1 | -1; v?: number };

export type LobbyAction =
  | { a: 'ready'; on: boolean }
  | { a: 'config'; config: Partial<GameConfig> }
  | { a: 'addBot'; level: BotLevel }
  | { a: 'kick'; pid: string }
  | { a: 'start' }
  | { a: 'rematch' }
  | { a: 'toLobby' }
  /** Host lässt einen getrennten Spieler vom Bot vertreten. */
  | { a: 'takeover'; pid: string };

export type Action = PlayerAction | LobbyAction;

export type Result = { ok: true } | { ok: false; err: string };

import type { Action, GameState, Look } from '../game/types';

export const PROTOCOL_VERSION = 1;

/** Gast → Host */
export type ClientMsg =
  /** `client` ist öffentlich (steht im Zustand), `secret` bleibt geheim und beweist den Besitz des Platzes. */
  | { k: 'hello'; proto: number; client: string; secret: string; name: string; look: Look }
  | { k: 'act'; act: Action }
  | { k: 'emote'; e: string }
  | { k: 'rematchReq' }
  | { k: 'pong'; t: number }
  | { k: 'bye' };

/** Host → Gast */
export type HostMsg =
  | { k: 'state'; s: GameState }
  | { k: 'reject'; reason: 'full' | 'started' | 'version' | 'kicked' | 'denied' }
  | { k: 'err'; msg: string }
  | { k: 'emote'; from: string; e: string }
  | { k: 'rematchReq'; from: string }
  | { k: 'ping'; t: number }
  | { k: 'closed' };

export const isMsg = (d: unknown): d is { k: string } => !!d && typeof d === 'object' && typeof (d as { k?: unknown }).k === 'string';

/** 4-stelliger Raumcode ohne verwechselbare Zeichen. */
export const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_LENGTH = 4;

export function makeRoomCode(): string {
  const arr = new Uint8Array(ROOM_LENGTH);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

export function normalizeRoomCode(s: string): string | null {
  const c = s
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (c.length !== ROOM_LENGTH) return null;
  return [...c].every((ch) => ROOM_ALPHABET.includes(ch)) ? c : null;
}

export const PEER_PREFIX = 'neonknobel-v1-';
export const peerIdForRoom = (room: string) => PEER_PREFIX + room;

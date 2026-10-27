import type { Action, GameState } from '../game/types';

export type LinkStatus = 'local' | 'connecting' | 'online' | 'waiting' | 'reconnecting' | 'error' | 'closed';

export type LinkEvent =
  | { type: 'state'; state: GameState }
  | { type: 'status'; status: LinkStatus; detail?: string }
  | { type: 'emote'; from: string; e: string }
  | { type: 'error'; msg: string }
  | { type: 'rematchReq'; from: string }
  | { type: 'rejected'; reason: RejectReason };

export type RejectReason = 'full' | 'started' | 'version' | 'closed' | 'kicked' | 'denied';

export const REJECT_TEXT: Record<RejectReason, string> = {
  full: 'Der Raum ist voll.',
  started: 'Das Spiel läuft bereits ohne dich.',
  version: 'Andere App-Version – bitte neu laden.',
  closed: 'Der Host hat das Spiel beendet.',
  kicked: 'Der Host hat dich aus dem Raum entfernt.',
  denied: 'Beitritt abgelehnt.',
};

/**
 * Einheitliche Sicht der Oberfläche auf ein Spiel – egal ob dieses Gerät
 * Host (= Server) ist oder Gast. Die UI kennt nur dieses Interface.
 */
export interface GameLink {
  readonly me: string;
  readonly isHost: boolean;
  readonly room: string;
  readonly online: boolean;
  state: GameState | null;
  status: LinkStatus;
  send(a: Action): void;
  emote(e: string): void;
  requestRematch(): void;
  on(fn: (ev: LinkEvent) => void): () => void;
  close(): void;
}

export class Emitter {
  private fns = new Set<(ev: LinkEvent) => void>();
  on(fn: (ev: LinkEvent) => void) {
    this.fns.add(fn);
    return () => {
      this.fns.delete(fn);
    };
  }
  emit(ev: LinkEvent) {
    for (const fn of [...this.fns]) {
      try {
        fn(ev);
      } catch (e) {
        console.error(e);
      }
    }
  }
}

import Peer, { type DataConnection } from 'peerjs';
import type { Action, GameState, Look } from '../game/types';
import { Emitter, type GameLink, type LinkEvent, type LinkStatus } from './link';
import { PROTOCOL_VERSION, isMsg, peerIdForRoom, type ClientMsg, type HostMsg } from './protocol';

const STALE_MS = 10000;

/**
 * Gast-Verbindung zum Host. Hält keine eigene Spiellogik:
 * Aktionen gehen zum Host, der komplette Zustand kommt zurück.
 * Verbindungsabbrüche werden automatisch mit Backoff neu aufgebaut.
 */
export class GuestLink implements GameLink {
  readonly isHost = false;
  readonly online = true;
  state: GameState | null = null;
  status: LinkStatus = 'connecting';
  private ev = new Emitter();
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private lastSeen = 0;
  private closed = false;

  constructor(
    readonly me: string,
    readonly room: string,
    private name: string,
    private look: Look,
    private secret: string,
  ) {
    this.ensurePeer();
    this.watchdog = setInterval(() => {
      if (this.conn?.open && this.lastSeen && Date.now() - this.lastSeen > STALE_MS) {
        this.lastSeen = 0;
        this.setStatus('reconnecting', 'timeout');
        this.dropConn();
        this.connect();
      }
    }, 2000);
    // Rückkehr aus dem Hintergrund (App-Wechsel): sofort neu verbinden, falls nötig.
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('online', this.onVisible);
  }

  private onVisible = () => {
    if (document.hidden || this.closed) return;
    if (!this.conn?.open) {
      this.attempts = 0;
      if (this.retry) clearTimeout(this.retry);
      this.retry = null;
      if (!this.peer || this.peer.destroyed || this.peer.disconnected) this.resetPeer();
      else this.connect();
    }
  };

  on(fn: (ev: LinkEvent) => void) {
    return this.ev.on(fn);
  }

  send(act: Action) {
    if (!this.raw({ k: 'act', act })) this.ev.emit({ type: 'error', msg: 'Keine Verbindung zum Host – wird wiederhergestellt …' });
  }

  emote(e: string) {
    this.raw({ k: 'emote', e });
  }

  requestRematch() {
    this.raw({ k: 'rematchReq' });
  }

  updateLook(name: string, look: Look) {
    this.name = name;
    this.look = look;
  }

  close() {
    this.closed = true;
    this.raw({ k: 'bye' });
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('online', this.onVisible);
    if (this.retry) clearTimeout(this.retry);
    if (this.watchdog) clearInterval(this.watchdog);
    setTimeout(() => {
      this.dropConn();
      this.peer?.destroy();
    }, 150);
    this.setStatus('closed');
  }

  private setStatus(s: LinkStatus, detail?: string) {
    if (this.status === s && !detail) return;
    this.status = s;
    this.ev.emit({ type: 'status', status: s, detail });
  }

  private raw(m: ClientMsg): boolean {
    if (!this.conn?.open) return false;
    try {
      this.conn.send(m);
      return true;
    } catch {
      return false;
    }
  }

  private later(fn: () => void) {
    if (this.closed) return;
    if (this.retry) clearTimeout(this.retry);
    const delay = Math.min(6000, 700 * 1.5 ** Math.min(this.attempts, 6));
    this.attempts++;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.closed) fn();
    }, delay);
  }

  private resetPeer() {
    this.dropConn();
    const p = this.peer;
    this.peer = null;
    try {
      p?.destroy();
    } catch {
      /* egal */
    }
    this.ensurePeer();
  }

  private ensurePeer() {
    if (this.closed || (this.peer && !this.peer.destroyed)) return;
    this.setStatus(this.state ? 'reconnecting' : 'connecting');
    const peer = new Peer({ debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer === this.peer) this.connect();
    });
    peer.on('disconnected', () => {
      if (this.closed || peer !== this.peer) return;
      this.later(() => {
        if (peer !== this.peer) return;
        try {
          peer.reconnect();
        } catch {
          this.resetPeer();
        }
      });
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (this.closed || peer !== this.peer) return;
      const type = err.type ?? 'unknown';
      if (type === 'peer-unavailable') {
        this.setStatus('waiting', 'Host nicht erreichbar');
        this.later(() => this.connect());
        return;
      }
      if (type === 'browser-incompatible') {
        this.setStatus('error', 'Dein Browser unterstützt kein WebRTC.');
        return;
      }
      this.setStatus('reconnecting', type);
      this.later(() => this.resetPeer());
    });
  }

  private dropConn() {
    const c = this.conn;
    this.conn = null;
    try {
      c?.close();
    } catch {
      /* egal */
    }
  }

  private connect() {
    const peer = this.peer;
    if (this.closed) return;
    if (!peer || peer.destroyed || peer.disconnected) {
      this.resetPeer();
      return;
    }
    this.dropConn();
    const c = peer.connect(peerIdForRoom(this.room), { reliable: true, serialization: 'json' });
    this.conn = c;
    const opening = setTimeout(() => {
      if (this.conn === c && !c.open) {
        this.dropConn();
        this.later(() => this.connect());
      }
    }, 12000);
    c.on('open', () => {
      clearTimeout(opening);
      if (this.conn !== c) return;
      this.attempts = 0;
      this.lastSeen = Date.now();
      this.raw({ k: 'hello', proto: PROTOCOL_VERSION, client: this.me, secret: this.secret, name: this.name, look: this.look });
    });
    c.on('data', (d) => {
      if (this.conn !== c || !isMsg(d)) return;
      this.lastSeen = Date.now();
      this.onHostMsg(d as HostMsg);
    });
    const lost = () => {
      if (this.conn !== c || this.closed) return;
      this.conn = null;
      this.setStatus('reconnecting', 'Verbindung verloren');
      this.later(() => this.connect());
    };
    c.on('close', lost);
    c.on('error', lost);
  }

  private onHostMsg(m: HostMsg) {
    switch (m.k) {
      case 'state':
        this.state = m.s;
        this.setStatus('online');
        this.ev.emit({ type: 'state', state: m.s });
        return;
      case 'reject':
        this.ev.emit({ type: 'rejected', reason: m.reason });
        this.closed = true;
        this.dropConn();
        this.setStatus('closed');
        return;
      case 'closed':
        this.ev.emit({ type: 'rejected', reason: 'closed' });
        return;
      case 'err':
        this.ev.emit({ type: 'error', msg: m.msg });
        return;
      case 'emote':
        this.ev.emit({ type: 'emote', from: m.from, e: m.e });
        return;
      case 'rematchReq':
        this.ev.emit({ type: 'rematchReq', from: m.from });
        return;
      case 'ping':
        this.raw({ k: 'pong', t: m.t });
        return;
    }
  }
}

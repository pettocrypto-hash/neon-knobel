import Peer, { type DataConnection } from 'peerjs';
import { botStep } from '../game/bot';
import { applyAction, autoMove, createRoom, cryptoRng, currentPlayer, joinPlayer, makePlayer, setConnected } from '../game/engine';
import type { Action, GameConfig, GameState, Look } from '../game/types';
import { Emitter, type GameLink, type LinkEvent, type LinkStatus } from './link';
import { PROTOCOL_VERSION, isMsg, peerIdForRoom, type ClientMsg, type HostMsg } from './protocol';

const SAVE_KEY = 'neonknobel.host';
const PING_MS = 3000;
const STALE_MS = 11000;

interface Guest {
  conn: DataConnection;
  client: string | null;
  lastSeen: number;
}

/**
 * Dieses Gerät ist der Server: hält den autoritativen Spielzustand, würfelt,
 * steuert Bots und den Zugtimer und verteilt den Zustand an alle Gäste.
 * Ohne `online` läuft alles lokal (Solo gegen Bots, offline).
 */
export class HostLink implements GameLink {
  readonly isHost = true;
  state: GameState;
  status: LinkStatus = 'local';
  private ev = new Emitter();
  private peer: Peer | null = null;
  private guests = new Set<Guest>();
  private botTimer: ReturnType<typeof setTimeout> | null = null;
  private tick: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private closed = false;
  private lastPing = 0;
  /** Geheime Schlüssel je Spieler-ID (nie im Zustand, nie an Gäste). */
  private secrets: Record<string, string>;
  private kicked: Set<string>;

  constructor(
    readonly me: string,
    readonly room: string,
    readonly online: boolean,
    init: { state?: GameState; name?: string; look?: Look; config?: GameConfig; secrets?: Record<string, string>; kicked?: string[] },
  ) {
    this.secrets = { ...(init.secrets ?? {}) };
    this.kicked = new Set(init.kicked ?? []);
    this.state = init.state ?? createRoom(room, makePlayer(me, init.name ?? 'Spieler', init.look!), init.config!);
    // Nach Neuladen: Gäste gelten als getrennt, bis sie sich melden.
    for (const p of this.state.players) if (!p.bot && p.id !== me) p.connected = !online ? true : false;
    setConnected(this.state, me, true);
    this.tick = setInterval(() => this.onTick(), 500);
    if (online) this.startPeer();
    this.persist();
    queueMicrotask(() => {
      this.ev.emit({ type: 'status', status: this.status });
      this.ev.emit({ type: 'state', state: this.state });
      this.scheduleBot();
    });
  }

  on(fn: (ev: LinkEvent) => void) {
    return this.ev.on(fn);
  }

  send(a: Action) {
    this.apply(this.me, a);
  }

  emote(e: string) {
    this.ev.emit({ type: 'emote', from: this.me, e });
    this.broadcast({ k: 'emote', from: this.me, e });
  }

  requestRematch() {
    this.send({ a: 'rematch' });
  }

  /** Direkte Änderung am Zustand durch den Host (z. B. Solo-Start), danach verteilen. */
  edit(fn: (s: GameState) => void) {
    fn(this.state);
    this.changed();
  }

  close() {
    this.closed = true;
    this.broadcast({ k: 'closed' });
    if (this.botTimer) clearTimeout(this.botTimer);
    if (this.tick) clearInterval(this.tick);
    if (this.retry) clearTimeout(this.retry);
    setTimeout(() => {
      for (const g of this.guests) g.conn.close();
      this.peer?.destroy();
    }, 150);
    clearHostSave();
    this.setStatus('closed');
  }

  // ---------- Spiel ----------

  private apply(pid: string, a: Action): boolean {
    const r = applyAction(this.state, pid, a, cryptoRng);
    if (r.ok && a.a === 'kick') this.kick(a.pid);
    if (!r.ok) {
      if (pid === this.me) this.ev.emit({ type: 'error', msg: r.err });
      else this.sendTo(pid, { k: 'err', msg: r.err });
      return false;
    }
    this.changed();
    return true;
  }

  private changed() {
    this.persist();
    this.ev.emit({ type: 'state', state: this.state });
    this.broadcast({ k: 'state', s: this.state });
    this.scheduleBot();
  }

  private scheduleBot() {
    if (this.botTimer) return;
    const s = this.state;
    if (s.phase !== 'playing') return;
    const p = currentPlayer(s);
    if (!p.bot) return;
    const last = s.events[s.events.length - 1];
    // Pausen wirken menschlich und lassen Zeit für Animationen.
    let delay = 650;
    if (last?.type === 'turn') delay = 1100;
    else if (last?.type === 'roll') delay = 1500;
    else if (last?.type === 'hold') delay = 380;
    else if (last?.type === 'module') delay = 900;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      const cur = currentPlayer(this.state);
      if (this.closed || this.state.phase !== 'playing' || cur.id !== p.id || !cur.bot) return;
      const act = botStep(this.state, cryptoRng);
      if (!this.apply(p.id, act)) {
        // Sicherheitsnetz: falls ein Bot-Zug abgelehnt wird, automatisch eintragen.
        autoMove(this.state, cryptoRng);
        this.changed();
      }
    }, delay);
  }

  private onTick() {
    const s = this.state;
    const now = Date.now();
    if (s.phase === 'playing' && s.turn.deadline && now > s.turn.deadline && !currentPlayer(s).bot) {
      if (autoMove(s, cryptoRng, now).ok) this.changed();
    }
    // Heartbeat
    if (this.online && now - this.lastPing > PING_MS) {
      this.lastPing = now;
      for (const g of [...this.guests]) {
        this.raw(g, { k: 'ping', t: now });
        if (now - g.lastSeen > STALE_MS) this.dropGuest(g);
      }
    }
  }

  private persist() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ me: this.me, room: this.room, online: this.online, state: this.state, secrets: this.secrets, kicked: [...this.kicked] } satisfies HostSave));
    } catch {
      /* Speicher voll oder gesperrt */
    }
  }

  // ---------- Netzwerk ----------

  private setStatus(s: LinkStatus, detail?: string) {
    if (this.status === s && !detail) return;
    this.status = s;
    this.ev.emit({ type: 'status', status: s, detail });
  }

  private startPeer() {
    if (this.closed) return;
    this.setStatus(this.attempts ? 'reconnecting' : 'connecting');
    const peer = new Peer(peerIdForRoom(this.room), { debug: 0 });
    this.peer = peer;
    peer.on('open', () => {
      if (peer !== this.peer) return;
      this.attempts = 0;
      this.setStatus('online');
    });
    peer.on('connection', (conn) => this.attach(conn));
    peer.on('disconnected', () => {
      if (this.closed || peer !== this.peer) return;
      this.setStatus('reconnecting');
      this.later(() => {
        if (peer === this.peer && !peer.destroyed && peer.disconnected) {
          try {
            peer.reconnect();
          } catch {
            this.restartPeer();
          }
        }
      });
    });
    peer.on('error', (err: Error & { type?: string }) => {
      if (this.closed || peer !== this.peer) return;
      const type = err.type ?? 'unknown';
      if (type === 'peer-unavailable') return;
      if (type === 'browser-incompatible') {
        this.setStatus('error', 'Dein Browser unterstützt kein WebRTC.');
        return;
      }
      // z. B. 'unavailable-id' direkt nach Neuladen: Raumcode noch kurz belegt.
      this.setStatus('reconnecting', type);
      this.restartPeer();
    });
  }

  private restartPeer() {
    const p = this.peer;
    this.peer = null;
    try {
      p?.destroy();
    } catch {
      /* egal */
    }
    this.later(() => this.startPeer());
  }

  private later(fn: () => void) {
    if (this.retry) clearTimeout(this.retry);
    const delay = Math.min(8000, 900 * 1.5 ** Math.min(this.attempts, 6));
    this.attempts++;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.closed) fn();
    }, delay);
  }

  private attach(conn: DataConnection) {
    const g: Guest = { conn, client: null, lastSeen: Date.now() };
    this.guests.add(g);
    conn.on('data', (d) => {
      g.lastSeen = Date.now();
      if (isMsg(d)) this.onGuestMsg(g, d as ClientMsg);
    });
    const gone = () => this.dropGuest(g);
    conn.on('close', gone);
    conn.on('error', gone);
  }

  private dropGuest(g: Guest) {
    if (!this.guests.delete(g)) return;
    try {
      g.conn.close();
    } catch {
      /* egal */
    }
    if (g.client && ![...this.guests].some((o) => o.client === g.client)) {
      setConnected(this.state, g.client, false);
      this.changed();
    }
  }

  private onGuestMsg(g: Guest, m: ClientMsg) {
    switch (m.k) {
      case 'hello': {
        if (m.proto !== PROTOCOL_VERSION) return this.raw(g, { k: 'reject', reason: 'version' });
        const client = String(m.client ?? '');
        const secret = String(m.secret ?? '');
        // Ein Gast darf weder den Platz des Hosts noch eines Bots übernehmen,
        // und fremde Plätze nur mit dem passenden geheimen Schlüssel.
        if (g.client && g.client !== client) return;
        if (!client || !secret || client === this.state.hostId || client.startsWith('bot-')) return this.raw(g, { k: 'reject', reason: 'denied' });
        if (this.secrets[client] && this.secrets[client] !== secret) return this.raw(g, { k: 'reject', reason: 'denied' });
        if (this.kicked.has(client)) return this.raw(g, { k: 'reject', reason: 'kicked' });
        const look =
          m.look && typeof m.look === 'object'
            ? { skin: String(m.look.skin).slice(0, 16), frame: String(m.look.frame).slice(0, 16), level: Math.max(1, Math.min(999, Number(m.look.level) || 1)) }
            : { skin: 'neon', frame: 'basic', level: 1 };
        const r = joinPlayer(this.state, client, String(m.name ?? '').slice(0, 14), look);
        if (!r.ok) return this.raw(g, { k: 'reject', reason: this.state.phase === 'lobby' ? 'full' : 'started' });
        // Alte Verbindung desselben Clients ersetzen
        this.secrets[client] = secret;
        for (const o of this.guests) if (o !== g && o.client === client) this.dropGuestSilently(o);
        g.client = client;
        this.changed();
        return;
      }
      case 'act':
        if (g.client && m.act && typeof m.act === 'object') this.apply(g.client, m.act);
        return;
      case 'emote':
        if (!g.client) return;
        this.ev.emit({ type: 'emote', from: g.client, e: String(m.e).slice(0, 8) });
        this.broadcast({ k: 'emote', from: g.client, e: String(m.e).slice(0, 8) });
        return;
      case 'rematchReq':
        if (g.client) this.ev.emit({ type: 'rematchReq', from: g.client });
        return;
      case 'bye':
        if (g.client && this.state.phase === 'lobby') {
          this.state.players = this.state.players.filter((p) => p.id !== g.client);
          g.client = null;
          this.changed();
        }
        this.dropGuest(g);
        return;
      case 'pong':
        return;
    }
  }

  /** Rausgeworfenen Spieler informieren, trennen und nicht wieder hereinlassen. */
  private kick(pid: string) {
    this.kicked.add(pid);
    delete this.secrets[pid];
    for (const g of [...this.guests])
      if (g.client === pid) {
        this.raw(g, { k: 'reject', reason: 'kicked' });
        setTimeout(() => this.dropGuestSilently(g), 200);
      }
  }

  private dropGuestSilently(g: Guest) {
    this.guests.delete(g);
    try {
      g.conn.close();
    } catch {
      /* egal */
    }
  }

  private raw(g: Guest, m: HostMsg) {
    try {
      if (g.conn.open) g.conn.send(m);
    } catch {
      /* Verbindung weg */
    }
  }

  private sendTo(client: string, m: HostMsg) {
    for (const g of this.guests) if (g.client === client) this.raw(g, m);
  }

  private broadcast(m: HostMsg) {
    for (const g of this.guests) if (g.client) this.raw(g, m);
  }
}

export interface HostSave {
  me: string;
  room: string;
  online: boolean;
  state: GameState;
  secrets?: Record<string, string>;
  kicked?: string[];
}

export function loadHostSave(): HostSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as HostSave;
    return s?.state?.v === 1 ? s : null;
  } catch {
    return null;
  }
}

export function clearHostSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* egal */
  }
}

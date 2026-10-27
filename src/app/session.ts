import { levelInfo } from './profile';
import { clientId, clientSecret, settings } from './settings';
import { addBot, startGame, cryptoRng } from '../game/engine';
import type { BotLevel, GameConfig, Look } from '../game/types';
import { GuestLink } from '../net/guest';
import { HostLink, clearHostSave, loadHostSave } from '../net/host';
import type { GameLink } from '../net/link';
import { makeRoomCode } from '../net/protocol';

/** Erzeugen, Beitreten, Fortsetzen und Verlassen von Partien. */

const SESSION_KEY = 'neonknobel.session';

interface SessionPointer {
  role: 'host' | 'guest';
  room: string;
  online: boolean;
}

export function myLook(): Look {
  return { skin: settings.skin, frame: settings.frame, level: levelInfo().level };
}

export const myName = () => settings.name.trim() || 'Spieler';

function savePointer(p: SessionPointer | null) {
  try {
    if (p) localStorage.setItem(SESSION_KEY, JSON.stringify(p));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* egal */
  }
}

export function loadPointer(): SessionPointer | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as SessionPointer) : null;
  } catch {
    return null;
  }
}

/** Solo/offline gegen Bots: startet sofort. */
export function startSolo(config: GameConfig, bots: BotLevel[]): GameLink {
  const room = 'SOLO';
  const link = new HostLink(clientId(), room, false, { name: myName(), look: myLook(), config });
  link.edit((s) => {
    for (const b of bots) addBot(s, b);
    startGame(s, cryptoRng);
  });
  savePointer({ role: 'host', room, online: false });
  return link;
}

export function createOnline(config: GameConfig): HostLink {
  const room = makeRoomCode();
  const link = new HostLink(clientId(), room, true, { name: myName(), look: myLook(), config });
  savePointer({ role: 'host', room, online: true });
  return link;
}

export function joinOnline(room: string): GuestLink {
  const link = new GuestLink(clientId(), room, myName(), myLook(), clientSecret());
  savePointer({ role: 'guest', room, online: true });
  return link;
}

/** Laufende Partie nach Neuladen fortsetzen (falls vorhanden). */
export function resumeSession(): GameLink | null {
  const ptr = loadPointer();
  if (!ptr) return null;
  if (ptr.role === 'host') {
    const save = loadHostSave();
    if (!save || save.room !== ptr.room || save.me !== clientId()) {
      savePointer(null);
      return null;
    }
    if (save.state.phase === 'over' && !save.online) {
      leaveSession(null);
      return null;
    }
    return new HostLink(save.me, save.room, save.online, { state: save.state, secrets: save.secrets, kicked: save.kicked });
  }
  return new GuestLink(clientId(), ptr.room, myName(), myLook(), clientSecret());
}

export function leaveSession(link: GameLink | null) {
  link?.close();
  savePointer(null);
  clearHostSave();
}

export function inviteUrl(room: string) {
  const u = new URL(location.href);
  u.search = `?room=${room}`;
  u.hash = '';
  return u.toString();
}

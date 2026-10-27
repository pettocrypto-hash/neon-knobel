import QRCode from 'qrcode';
import { audio } from '../audio/audio';
import { inviteUrl, leaveSession } from '../app/session';
import { RULES } from '../config/rules';
import { BOT_LABEL } from '../game/engine';
import { CATS } from '../game/scoring';
import type { BotLevel, GameConfig, GameState } from '../game/types';
import { REJECT_TEXT, type LinkStatus } from '../net/link';
import type { App } from './app';
import { button, confirmDialog, h, screenHeader, segmented, toast, toggle } from './dom';
import { gameScreen } from './game';
import { startScreen } from './menus';
import { avatar } from './widgets';

export const STATUS_TEXT: Record<LinkStatus, string> = {
  local: 'Offline',
  connecting: 'Verbinde …',
  online: 'Online',
  waiting: 'Warte auf Host …',
  reconnecting: 'Verbindung wird wiederhergestellt …',
  error: 'Fehler',
  closed: 'Getrennt',
};

export function lobbyScreen(app: App): HTMLElement & { cleanup?: () => void } {
  const link = app.link!;
  audio.setIntensity(0);
  const status = h('div', { class: 'link-status' });
  const body = h('div', { class: 'lobby-body' });
  const qrImg = h('img', { class: 'qr', alt: 'QR-Code zum Beitreten', width: 168, height: 168 }) as HTMLImageElement;
  const url = inviteUrl(link.room);
  void QRCode.toDataURL(url, { margin: 1, width: 336, color: { dark: '#00f0ff', light: '#07040f' } }).then((d: string) => (qrImg.src = d));

  const leave = async () => {
    if (await confirmDialog(link.isHost ? 'Raum schließen? Alle Mitspieler fliegen raus.' : 'Lobby verlassen?', 'Verlassen', 'Bleiben')) {
      leaveSession(link);
      app.setLink(null);
      app.go(startScreen);
    }
  };

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'NEON KNOBEL', text: `Spiel mit mir NEON KNOBEL! Raumcode: ${link.room}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link kopiert!', 'good');
      }
    } catch {
      /* abgebrochen */
    }
  };

  const invite = h(
    'div',
    { class: 'panel invite' },
    h('span', { class: 'label' }, 'RAUMCODE'),
    h('div', { class: 'room-code', 'aria-label': `Raumcode ${link.room.split('').join(' ')}` }, ...link.room.split('').map((c) => h('span', null, c))),
    qrImg,
    h('div', { class: 'row' }, button('🔗 Link teilen', share, 'ghost small'), button('📋 Code kopieren', () => void navigator.clipboard?.writeText(link.room).then(() => toast('Code kopiert', 'good')), 'ghost small')),
  );

  let lastPhase = '';
  const render = (s: GameState | null) => {
    if (!s) {
      body.replaceChildren(h('div', { class: 'panel center loading' }, h('div', { class: 'spinner' }), h('p', null, 'Verbinde mit dem Raum …')));
      return;
    }
    if (s.phase !== 'lobby' && lastPhase !== s.phase) {
      app.go(gameScreen);
      return;
    }
    lastPhase = s.phase;
    const me = s.players.find((p) => p.id === link.me);
    const isHost = link.isHost;
    const cfg = s.config;
    const allReady = s.players.every((p) => p.ready);
    const slots = [];
    for (let i = 0; i < RULES.MAX_PLAYERS; i++) {
      const p = s.players[i];
      if (!p) {
        slots.push(h('div', { class: 'slot empty' }, h('span', { class: 'slot-empty-dot' }), h('span', null, 'Freier Platz')));
        continue;
      }
      slots.push(
        h(
          'div',
          { class: `slot ${p.ready ? 'ready' : ''} ${p.connected ? '' : 'offline'}` },
          avatar(p.name, p.look, { bot: !!p.bot, size: 'sm' }),
          h(
            'div',
            { class: 'slot-info' },
            h('b', null, p.name, p.id === link.me ? ' (du)' : ''),
            h('small', null, p.bot ? `Bot · ${BOT_LABEL[p.bot]}` : p.id === s.hostId ? 'Host' : p.connected ? (p.ready ? 'Bereit' : 'Nicht bereit') : 'Getrennt'),
          ),
          h('span', { class: `ready-dot ${p.ready ? 'on' : ''}` }, p.ready ? '✓' : '…'),
          isHost && p.id !== s.hostId ? button('✕', () => link.send({ a: 'kick', pid: p.id }), 'icon-btn small', { 'aria-label': `${p.name} entfernen` }) : null,
        ),
      );
    }
    const setCfg = (c: Partial<GameConfig>) => link.send({ a: 'config', config: c });
    const cfgView = isHost
      ? h(
          'div',
          { class: 'panel cfg' },
          h('h3', { class: 'label' }, 'Einstellungen'),
          segmented(
            [
              { value: 'classic', label: 'Klassik', sub: `1 Spalte · ${CATS.length} Runden` },
              { value: 'marathon', label: 'Marathon', sub: `7 Spalten · ${CATS.length * 7} Runden` },
            ],
            cfg.mode,
            (v) => setCfg({ mode: v as GameConfig['mode'] }),
          ),
          segmented(
            RULES.TURN_TIMERS.map((t) => ({ value: t, label: t ? `${t} s` : 'Kein Timer' })),
            cfg.turnSeconds,
            (v) => setCfg({ turnSeconds: v }),
          ),
          toggle('Energie-Module', cfg.modules, (v) => setCfg({ modules: v }), 'Aus = Purist-Modus'),
        )
      : h(
          'div',
          { class: 'panel cfg-summary' },
          h('span', { class: 'chip' }, cfg.mode === 'classic' ? 'Klassik · 1 Spalte' : 'Marathon · 7 Spalten'),
          h('span', { class: 'chip' }, cfg.turnSeconds ? `Timer ${cfg.turnSeconds} s` : 'Kein Timer'),
          h('span', { class: 'chip' }, cfg.modules ? 'Module an' : 'Purist'),
        );

    const actions = isHost
      ? h(
          'div',
          { class: 'lobby-actions' },
          s.players.length < RULES.MAX_PLAYERS
            ? h('div', { class: 'row bot-add' }, h('span', { class: 'label' }, 'Bot:'), ...(['easy', 'medium', 'hard'] as BotLevel[]).map((l) => button(BOT_LABEL[l], () => link.send({ a: 'addBot', level: l }), 'ghost small')))
            : null,
          button(allReady ? 'SPIEL STARTEN' : 'Warte, bis alle bereit sind …', () => link.send({ a: 'start' }), `primary big ${allReady ? '' : 'disabled'}`, { disabled: !allReady }),
          s.players.length === 1 ? h('p', { class: 'hint center' }, 'Teile den Code – oder starte allein bzw. mit Bots.') : null,
        )
      : h('div', { class: 'lobby-actions' }, me ? button(me.ready ? '✓ BEREIT' : 'ICH BIN BEREIT', () => link.send({ a: 'ready', on: !me.ready }), me.ready ? 'accent big' : 'primary big') : null, h('p', { class: 'hint center' }, 'Der Host startet, sobald alle bereit sind.'));

    body.replaceChildren(h('div', { class: 'panel slots' }, ...slots), cfgView, actions);
  };

  const setStatus = (st: LinkStatus, detail?: string) => {
    status.className = `link-status st-${st}`;
    status.textContent = STATUS_TEXT[st] + (detail && st === 'error' ? `: ${detail}` : '');
  };

  const off = link.on((ev) => {
    if (ev.type === 'state') render(ev.state);
    else if (ev.type === 'status') setStatus(ev.status, ev.detail);
    else if (ev.type === 'error') {
      toast(ev.msg, 'warn');
    } else if (ev.type === 'rejected') {
      toast(REJECT_TEXT[ev.reason], 'bad', 3500);
      leaveSession(link);
      app.setLink(null);
      app.go(startScreen);
    }
  });

  setStatus(link.status);
  render(link.state);
  const el = h('section', { class: 'page lobby' }, screenHeader('Lobby', leave, status), invite, body) as HTMLElement & { cleanup?: () => void };
  el.cleanup = off;
  return el;
}

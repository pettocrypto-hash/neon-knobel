import { audio } from '../audio/audio';
import { dailyState, levelInfo, profile } from '../app/profile';
import { createOnline, joinOnline, myLook, startSolo } from '../app/session';
import { settings, updateSettings } from '../app/settings';
import { RULES } from '../config/rules';
import { BOT_LABEL } from '../game/engine';
import { CATS } from '../game/scoring';
import type { BotLevel, GameConfig, Mode } from '../game/types';
import { normalizeRoomCode, ROOM_LENGTH } from '../net/protocol';
import type { App } from './app';
import { button, h, screenHeader, segmented, toast, toggle } from './dom';
import { achievementsScreen, collectionScreen, rulesScreen, settingsScreen, statsScreen } from './extras';
import { gameScreen } from './game';
import { lobbyScreen } from './lobby';
import { avatar, levelBar, logo } from './widgets';

function nameField(): HTMLElement {
  const input = h('input', { class: 'input name-input', maxlength: 14, placeholder: 'Dein Name', value: settings.name, autocomplete: 'off', enterkeyhint: 'done' }) as HTMLInputElement;
  input.addEventListener('change', () => updateSettings({ name: input.value.trim().slice(0, 14) }));
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return input;
}

function ensureName(): boolean {
  if (settings.name.trim()) return true;
  toast('Gib zuerst deinen Namen ein.', 'warn');
  (document.querySelector('.name-input') as HTMLInputElement | null)?.focus();
  return false;
}

export function startScreen(app: App): HTMLElement {
  audio.setIntensity(0);
  audio.startMusic();
  const lv = levelInfo();
  const daily = dailyState();
  const el = h(
    'section',
    { class: 'menu' },
    h(
      'button',
      {
        type: 'button',
        class: 'design-toggle',
        'aria-label': 'Design wechseln',
        onclick: (() => {
          audio.play('select');
          updateSettings({ design: settings.design === 'clean' ? 'neon' : 'clean' });
          app.go(startScreen);
        }) as EventListener,
      },
      settings.design === 'clean' ? '✦ Neon' : '◐ Klar',
    ),
    logo(),
    h(
      'div',
      { class: 'panel profile-card' },
      h('button', { class: 'profile-av', type: 'button', onclick: (() => app.go(collectionScreen)) as EventListener }, avatar(settings.name || '?', myLook(), { size: 'lg' })),
      h('div', { class: 'profile-main' }, nameField(), levelBar(lv.level, lv.pct, `${lv.into} / ${lv.need} XP`)),
    ),
    h(
      'div',
      { class: `panel daily ${daily.done ? 'done' : ''}` },
      h('div', { class: 'daily-head' }, h('span', { class: 'tag' }, 'TAGES-CHALLENGE'), h('span', { class: 'daily-streak' }, `🔥 ${daily.streak} Tage`)),
      h('p', { class: 'daily-text' }, daily.challenge.text),
      h('span', { class: 'daily-state' }, daily.done ? '✓ Geschafft – morgen gibt es eine neue' : `Belohnung: XP · 7 Tage am Stück: exklusiver Skin`),
    ),
    h(
      'div',
      { class: 'menu-actions' },
      button(h('span', null, h('b', null, 'SOLO & BOTS'), h('small', null, 'Training oder gegen 1–3 Bots')), () => ensureName() && app.go(soloSetupScreen), 'primary big'),
      button(h('span', null, h('b', null, 'ONLINE ERSTELLEN'), h('small', null, 'Raumcode für bis zu 4 Handys')), () => ensureName() && app.go(onlineSetupScreen), 'accent big'),
      button(h('span', null, h('b', null, 'BEITRETEN'), h('small', null, 'Mit 4-stelligem Code')), () => ensureName() && app.go((a) => joinScreen(a)), 'ghost big'),
    ),
    h(
      'nav',
      { class: 'menu-grid' },
      button(h('span', null, '🏆', h('small', null, 'Erfolge')), () => app.go(achievementsScreen), 'tile'),
      button(h('span', null, '📊', h('small', null, 'Statistik')), () => app.go(statsScreen), 'tile'),
      button(h('span', null, '🎲', h('small', null, 'Sammlung')), () => app.go(collectionScreen), 'tile'),
      button(h('span', null, '⚙', h('small', null, 'Optionen')), () => app.go(settingsScreen), 'tile'),
      button(h('span', null, '📖', h('small', null, 'Regeln')), () => app.go(rulesScreen), 'tile'),
    ),
    app.installPrompt ? button('📲 Als App installieren', () => void app.installPrompt?.prompt(), 'ghost small install-btn') : null,
    h('p', { class: 'foot' }, `Bestwert Klassik: ${profile.stats.bestClassic || '–'} · Spiele: ${profile.stats.games}`),
  );
  return el;
}

function configBlock(cfg: GameConfig): HTMLElement {
  const cols = (m: Mode) => RULES.COLUMNS[m];
  return h(
    'div',
    { class: 'cfg' },
    h('h3', { class: 'label' }, 'Spielmodus'),
    segmented<Mode>(
      [
        { value: 'classic', label: 'Klassik', sub: `1 Spalte · ${cols('classic') * CATS.length} Runden` },
        { value: 'marathon', label: 'Marathon', sub: `7 Spalten · ${cols('marathon') * CATS.length} Runden` },
      ],
      cfg.mode,
      (v) => (cfg.mode = v),
    ),
    h('h3', { class: 'label' }, 'Zugtimer'),
    segmented<number>(
      RULES.TURN_TIMERS.map((t) => ({ value: t, label: t ? `${t} s` : 'Aus' })),
      cfg.turnSeconds,
      (v) => (cfg.turnSeconds = v),
    ),
    h('div', { class: 'gap' }),
    toggle('Energie-Module', cfg.modules, (v) => (cfg.modules = v), 'Aus = Purist-Modus: reines Würfelglück und Taktik'),
  );
}

export function soloSetupScreen(app: App): HTMLElement {
  const cfg: GameConfig = { mode: 'classic', modules: true, turnSeconds: 0 };
  const bots: BotLevel[] = ['medium'];
  const list = h('div', { class: 'bot-list' });
  const renderBots = () => {
    list.replaceChildren(
      ...bots.map((lv, i) =>
        h(
          'div',
          { class: 'bot-row' },
          h('span', { class: 'bot-name' }, `Bot ${i + 1}`),
          segmented<BotLevel>(
            (['easy', 'medium', 'hard'] as BotLevel[]).map((l) => ({ value: l, label: BOT_LABEL[l] })),
            lv,
            (v) => (bots[i] = v),
          ),
          button('✕', () => (bots.splice(i, 1), renderBots()), 'icon-btn', { 'aria-label': 'Bot entfernen' }),
        ),
      ),
      bots.length < RULES.MAX_PLAYERS - 1 ? button('+ Bot hinzufügen', () => (bots.push('medium'), renderBots()), 'ghost small') : h('span'),
      bots.length === 0 ? h('p', { class: 'hint' }, 'Ohne Bots: Solo-Training auf Highscore.') : h('span'),
    );
  };
  renderBots();
  return h(
    'section',
    { class: 'page' },
    screenHeader('Solo & Bots', () => app.go(startScreen)),
    h('div', { class: 'panel' }, configBlock(cfg)),
    h('div', { class: 'panel' }, h('h3', { class: 'label' }, 'Gegner'), list),
    button(
      'SPIEL STARTEN',
      () => {
        const link = startSolo(cfg, bots);
        app.setLink(link);
        app.go(gameScreen);
      },
      'primary big sticky-cta',
    ),
  );
}

export function onlineSetupScreen(app: App): HTMLElement {
  const cfg: GameConfig = { mode: 'classic', modules: true, turnSeconds: 45 };
  return h(
    'section',
    { class: 'page' },
    screenHeader('Online-Spiel', () => app.go(startScreen)),
    h('div', { class: 'panel' }, configBlock(cfg)),
    h('p', { class: 'hint center' }, 'Du bekommst einen Raumcode und einen Link. Freie Plätze kannst du in der Lobby mit Bots füllen.'),
    button(
      'RAUM ERSTELLEN',
      () => {
        const link = createOnline(cfg);
        app.setLink(link);
        app.go(lobbyScreen);
      },
      'accent big sticky-cta',
    ),
  );
}

export function joinScreen(app: App, preset?: string): HTMLElement {
  const input = h('input', {
    class: 'input code-input',
    maxlength: ROOM_LENGTH,
    placeholder: '····',
    value: preset ?? '',
    autocomplete: 'off',
    autocapitalize: 'characters',
    spellcheck: 'false',
    enterkeyhint: 'go',
    'aria-label': 'Raumcode',
  }) as HTMLInputElement;
  const go = () => {
    if (!ensureName()) return;
    const code = normalizeRoomCode(input.value);
    if (!code) {
      toast(`Der Code hat ${ROOM_LENGTH} Zeichen.`, 'warn');
      audio.play('error');
      return;
    }
    app.setLink(joinOnline(code));
    app.go(lobbyScreen);
  };
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (input.value.length === ROOM_LENGTH) input.blur();
  });
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  const el = h(
    'section',
    { class: 'page' },
    screenHeader('Beitreten', () => app.go(startScreen)),
    !settings.name.trim() ? h('div', { class: 'panel' }, h('h3', { class: 'label' }, 'Dein Name'), nameField()) : null,
    h('div', { class: 'panel center' }, h('h3', { class: 'label' }, 'Raumcode'), input, h('p', { class: 'hint' }, 'Den Code siehst du auf dem Handy des Hosts.')),
    button('BEITRETEN', go, 'primary big sticky-cta'),
  );
  if (!preset) setTimeout(() => input.focus(), 350);
  return el;
}

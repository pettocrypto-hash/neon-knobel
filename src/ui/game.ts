import { audio } from '../audio/audio';
import { THEMES } from '../app/cosmetics';
import { leaveSession } from '../app/session';
import { onSettings, settings, updateSettings, vibrate } from '../app/settings';
import { ENERGY, MODULE_IDS, RULES, type ModuleId } from '../config/rules';
import { DiceScene } from '../dice/dice-scene';
import { suggestCell } from '../game/bot';
import { canUseModule, currentPlayer, ranking, turnsPerPlayer } from '../game/engine';
import { CAT_LABEL, counts, score, scoreAll, totalScore, type Cat } from '../game/scoring';
import type { GameEvent, GameState, Player } from '../game/types';
import { REJECT_TEXT, type LinkStatus } from '../net/link';
import type { App } from './app';
import { button, confirmDialog, flash, h, shake, sheet, toast, toggle } from './dom';
import { centerOf, fx } from './fx';
import { lobbyScreen, STATUS_TEXT } from './lobby';
import { startScreen } from './menus';
import { showResults } from './results';
import { renderBlock } from './scoreblock';
import { avatar, dieFace } from './widgets';

const EMOTES = ['GG', 'NICE', 'WOW', 'OUCH', '🔥', '😎', '😱', '👏', '🤖', '🎲'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

type SelectMode = { id: 'nudge' | 'freeze' | 'joker' } | null;

export function gameScreen(app: App): HTMLElement & { cleanup?: () => void } {
  const link = app.link!;
  const me = link.me;
  audio.setIntensity(1);
  audio.startMusic();

  // ---------- DOM ----------
  const chips = h('div', { class: 'chips', role: 'tablist', 'aria-label': 'Spieler' });
  const statusDot = h('span', { class: 'net-dot', title: '' });
  const top = h(
    'header',
    { class: 'g-top' },
    button('☰', () => openMenu(), 'icon-btn', { 'aria-label': 'Menü' }),
    chips,
    button('💬', () => openEmotes(), 'icon-btn', { 'aria-label': 'Emotes' }),
  );
  const turnText = h('span', { class: 'turn-text' });
  const rankHint = h('span', { class: 'rank-hint' });
  const ticker = h('div', { class: 'g-ticker' }, statusDot, turnText, rankHint);
  const timerBar = h('i');
  const timer = h('div', { class: 'g-timer' }, timerBar);
  const viewLabel = h('div', { class: 'view-label' });
  const blockHost = h('div', { class: 'block-host' });
  const blockWrap = h('div', { class: 'g-block' }, viewLabel, blockHost);
  const diceHost = h('div', { class: 'dice-host' });
  const rollPips = h('div', { class: 'roll-pips', 'aria-hidden': 'true' });
  const dockHint = h('div', { class: 'dock-hint' });
  const selectBar = h('div', { class: 'select-bar hidden' });
  const streakTag = h('div', { class: 'streak-tag hidden' });
  const dock = h('div', { class: 'g-dock' }, diceHost, h('div', { class: 'dock-overlay' }, rollPips, streakTag, dockHint), selectBar, timer);
  const coreRing = h('span', { class: 'core-ring' });
  const coreVal = h('span', { class: 'core-val' });
  const coreBtn = h('button', { type: 'button', class: 'core-btn', 'aria-label': 'Energie-Module', onclick: (() => openModules()) as EventListener }, coreRing, h('span', { class: 'core-in' }, h('span', { class: 'core-bolt' }, '⚡'), coreVal));
  const rollLabel = h('span', { class: 'roll-label' }, 'WÜRFELN');
  const rollSub = h('span', { class: 'roll-sub' });
  const rollBtn = h('button', { type: 'button', class: 'btn roll-btn', onclick: (() => doRoll()) as EventListener }, rollLabel, rollSub);
  const bestBtn = h('button', { type: 'button', class: 'best-btn', 'aria-label': 'Bestes Feld zeigen', onclick: (() => jumpToBest()) as EventListener }, '★');
  const controls = h('div', { class: 'g-controls' }, coreBtn, rollBtn, bestBtn);
  const el = h('section', { class: 'game' }, top, ticker, blockWrap, dock, controls) as HTMLElement & { cleanup?: () => void };

  // ---------- Zustand ----------
  let state: GameState | null = null;
  let lastSeq = -1;
  let viewId = me;
  let focusCol = 0;
  let rolling = false;
  let select: SelectMode = null;
  let fresh: { col: number; cat: Cat } | null = null;
  let freshTimer: ReturnType<typeof setTimeout> | null = null;
  let resultsShown = false;
  let closeResults: (() => void) | null = null;
  let lastTick = 0;
  let disconnectedSince = 0;
  let pendingGather = false;
  let resultsTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let gameNo = -1;

  const scene = new DiceScene(diceHost, { quality: settings.quality, reduceMotion: settings.reduceMotion });
  scene.setSkin(settings.skin, settings.colorblind);
  const applyTheme = () => {
    const t = THEMES.find((x) => x.id === settings.theme) ?? THEMES[0];
    scene.setLights(t.a, t.b);
  };
  applyTheme();
  scene.onImpact = (k) => {
    audio.play('land');
    if (k > 0.6) vibrate(6);
  };
  scene.onSwipe = () => doRoll();
  scene.onTap = (i) => onDieTap(i);

  const meP = () => state?.players.find((p) => p.id === me) ?? null;
  const isMyTurn = () => !!state && state.phase === 'playing' && currentPlayer(state).id === me;
  const canRoll = () => isMyTurn() && !rolling && !select && state!.turn.rolls < state!.turn.maxRolls && !(state!.turn.rolls > 0 && state!.turn.held.every(Boolean));

  // ---------- Aktionen ----------
  let motionAsked = false;
  function doRoll() {
    if (!canRoll()) {
      if (isMyTurn() && state!.turn.rolls >= state!.turn.maxRolls) toast('Keine Würfe mehr – wähle ein Feld im Block.', 'info');
      return;
    }
    askMotion();
    vibrate(15);
    link.send({ a: 'roll' });
  }

  function askMotion() {
    if (motionAsked || !settings.shake) return;
    motionAsked = true;
    const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
    if (DM?.requestPermission) void DM.requestPermission().catch(() => undefined);
  }

  function onDieTap(i: number) {
    if (!state || !isMyTurn() || rolling) return;
    const t = state.turn;
    if (select) return chooseModuleTarget(i);
    if (t.rolls === 0) return;
    if (t.locked[i]) {
      toast('Eingefroren – bleibt diesen Zug liegen.', 'info');
      return;
    }
    audio.play(t.held[i] ? 'unlock' : 'lock');
    vibrate(8);
    link.send({ a: 'hold', i });
  }

  function pick(col: number, cat: Cat) {
    if (!state || !isMyTurn() || rolling) return;
    const pts = score(state.turn.dice, cat);
    const multi = state.config.mode === 'marathon';
    const send = () => {
      link.send({ a: 'score', col, cat });
      vibrate(pts ? 12 : [10, 40, 10]);
    };
    if (!settings.confirmScore) return send();
    const dice = h('div', { class: 'confirm-dice' }, ...state.turn.dice.map((d) => dieFace(d)));
    const close = sheet(
      h(
        'div',
        { class: 'confirm' },
        h('span', { class: 'label' }, multi ? `SPALTE ${ROMAN[col]}` : 'EINTRAGEN'),
        h('h3', { class: 'confirm-cat' }, CAT_LABEL[cat]),
        dice,
        h('div', { class: `confirm-pts ${pts ? '' : 'zero'}` }, pts ? `+${pts}` : '0'),
        h('p', { class: 'hint center' }, pts ? 'Punkte eintragen?' : 'Passt nicht – Feld wird gestrichen.'),
        h(
          'div',
          { class: 'row' },
          button('Abbrechen', () => close(), 'ghost'),
          button(
            pts ? 'EINTRAGEN' : 'STREICHEN',
            () => {
              close();
              send();
            },
            pts ? 'primary' : 'danger',
          ),
        ),
      ),
      { cls: 'confirm-sheet' },
    );
  }

  function jumpToBest() {
    if (!state || !isMyTurn() || state.turn.rolls === 0 || rolling) return;
    const p = meP()!;
    const s = suggestCell(p, state.turn.dice);
    if (!s) return;
    focusCol = s.col;
    render();
    const cell = blockHost.querySelector('.bval.best');
    cell?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    cell?.classList.add('ping');
  }

  // ---------- Module ----------
  function openModules() {
    if (!state) return;
    const p = meP();
    if (!p) return;
    if (!state.config.modules) {
      toast('Purist-Modus: Module sind in dieser Partie aus.', 'info');
      return;
    }
    const uses = ENERGY.USES[state.config.mode];
    const cards = MODULE_IDS.map((id) => {
      const m = ENERGY.MODULES[id];
      const err = isMyTurn() ? canUseModule(state!, p, id) : 'Nur in deinem Zug.';
      return h(
        'button',
        {
          type: 'button',
          class: `mod-card ${err ? 'off' : ''}`,
          onclick: (() => {
            if (err) {
              toast(err, 'warn');
              audio.play('error');
              return;
            }
            close();
            activateModule(id);
          }) as EventListener,
        },
        h('span', { class: 'mod-icon' }, m.icon),
        h('span', { class: 'mod-text' }, h('b', null, m.name), h('small', null, m.desc)),
        h('span', { class: 'mod-meta' }, h('span', { class: 'mod-cost' }, `⚡${m.cost}`), h('small', null, `${uses[id] - p.uses[id]}/${uses[id]}`)),
      );
    });
    const close = sheet(
      h(
        'div',
        { class: 'modules' },
        h('div', { class: 'mod-head' }, h('span', { class: 'label' }, 'ENERGIE-KERN'), h('b', { class: 'mod-energy' }, `${p.energy} / ${ENERGY.MAX}`)),
        h('div', { class: 'energy-track' }, h('i', { style: `width:${(p.energy / ENERGY.MAX) * 100}%` })),
        h('p', { class: 'hint' }, 'Energie gibt es für starke Züge: Straßen, Volles Haus, 5 Gleiche, Bonus, Combo-Streaks. Jedes Modul einmal pro Zug.'),
        ...cards,
      ),
    );
  }

  function activateModule(id: ModuleId) {
    if (id === 'reroll') {
      link.send({ a: 'mod', id });
      return;
    }
    select = { id };
    scene.setSelectMode(true);
    const names = { nudge: 'Nudge: Tippe den Würfel, den du verschieben willst.', freeze: 'Freeze: Tippe den Würfel, der liegen bleiben soll.', joker: 'Joker: Tippe den Würfel, den du ändern willst.' };
    selectBar.replaceChildren(h('span', null, names[id]), button('Abbrechen', () => endSelect(), 'ghost small'));
    selectBar.classList.remove('hidden');
    render();
  }

  function endSelect() {
    select = null;
    scene.setSelectMode(false);
    selectBar.classList.add('hidden');
    render();
  }

  function chooseModuleTarget(i: number) {
    if (!select || !state) return;
    const t = state.turn;
    const id = select.id;
    if (id === 'freeze') {
      if (t.locked[i]) return toast('Schon eingefroren.', 'info');
      endSelect();
      link.send({ a: 'mod', id, i });
      return;
    }
    const v = t.dice[i];
    const pick1 = (content: HTMLElement) => sheet(content, { cls: 'pick-sheet', onClose: () => undefined });
    if (id === 'nudge') {
      const close = pick1(
        h(
          'div',
          { class: 'nudge' },
          h('span', { class: 'label' }, 'NUDGE'),
          h('div', { class: 'nudge-row' }, button(h('span', null, dieFace(Math.max(1, v - 1)), '−1'), () => go(-1), `ghost ${v <= 1 ? 'disabled' : ''}`, { disabled: v <= 1 }), dieFace(v, 'big'), button(h('span', null, dieFace(Math.min(6, v + 1)), '+1'), () => go(1), `ghost ${v >= 6 ? 'disabled' : ''}`, { disabled: v >= 6 })),
        ),
      );
      const go = (d: 1 | -1) => {
        close();
        endSelect();
        link.send({ a: 'mod', id: 'nudge', i, d });
      };
      return;
    }
    const close = pick1(
      h(
        'div',
        { class: 'joker' },
        h('span', { class: 'label' }, 'JOKER – NEUE AUGENZAHL'),
        h(
          'div',
          { class: 'joker-row' },
          ...[1, 2, 3, 4, 5, 6].map((n) =>
            h(
              'button',
              {
                type: 'button',
                class: `joker-btn ${n === v ? 'cur' : ''}`,
                onclick: (() => {
                  close();
                  endSelect();
                  link.send({ a: 'mod', id: 'joker', i, v: n });
                }) as EventListener,
              },
              dieFace(n),
            ),
          ),
        ),
      ),
    );
  }

  // ---------- Menüs ----------
  function openMenu() {
    const close = sheet(
      h(
        'div',
        { class: 'gmenu' },
        h('span', { class: 'label' }, `RAUM ${link.room}${link.online ? '' : ' · OFFLINE'}`),
        toggle('Musik', settings.musicOn, (v) => updateSettings({ musicOn: v })),
        toggle('Effekte', settings.sfxOn, (v) => updateSettings({ sfxOn: v })),
        toggle('Vibration', settings.vibrate, (v) => updateSettings({ vibrate: v })),
        toggle('Schütteln zum Würfeln', settings.shake, (v) => updateSettings({ shake: v })),
        toggle('Eintragen bestätigen', settings.confirmScore, (v) => updateSettings({ confirmScore: v })),
        toggle('Emotes stumm', settings.emotesMuted, (v) => updateSettings({ emotesMuted: v })),
        h('div', { class: 'gap' }),
        button(
          link.isHost && link.online ? 'Spiel beenden (für alle)' : 'Spiel verlassen',
          async () => {
            close();
            const text = link.isHost && link.online ? 'Spiel für alle beenden?' : link.online ? 'Spiel verlassen? Du kannst über den Code wieder beitreten.' : 'Partie abbrechen?';
            if (await confirmDialog(text, 'Verlassen', 'Weiterspielen')) {
              leaveSession(link);
              app.setLink(null);
              app.go(startScreen);
            }
          },
          'danger',
        ),
        button('Weiterspielen', () => close(), 'primary'),
      ),
    );
  }

  function openEmotes() {
    if (!link.online && state && state.players.every((p) => p.id === me || p.bot)) {
      // Auch gegen Bots: Spaß-Emotes, Bots antworten
    }
    const close = sheet(
      h(
        'div',
        { class: 'emotes' },
        h('span', { class: 'label' }, 'EMOTE SENDEN'),
        h(
          'div',
          { class: 'emote-grid' },
          ...EMOTES.map((e) =>
            h(
              'button',
              {
                type: 'button',
                class: 'emote-btn',
                onclick: (() => {
                  close();
                  link.emote(e);
                  if (!link.online) showEmote(me, e);
                  botReply();
                }) as EventListener,
              },
              e,
            ),
          ),
        ),
      ),
    );
  }

  function botReply() {
    if (!state || Math.random() > 0.5) return;
    const bots = state.players.filter((p) => p.bot && !p.standIn);
    if (!bots.length) return;
    const b = bots[Math.floor(Math.random() * bots.length)];
    setTimeout(() => showEmote(b.id, ['🤖', 'GG', 'NICE', '😎'][Math.floor(Math.random() * 4)]), 700 + Math.random() * 900);
  }

  function showEmote(from: string, e: string) {
    if (settings.emotesMuted && from !== me) return;
    const chip = chips.querySelector(`[data-pid="${CSS.escape(from)}"]`);
    const pos = centerOf(chip);
    const bubble = h('div', { class: 'emote-bubble', style: `left:${pos.x}px;top:${pos.y + 26}px` }, e);
    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 2200);
    audio.play('emote');
  }

  // ---------- Effekte ----------
  function banner(text: string, kind: 'big' | 'good' | 'five' | 'turn' | 'near' | 'bonus', sub?: string) {
    const b = h('div', { class: `banner banner-${kind}` }, h('b', null, text), sub ? h('small', null, sub) : null);
    el.appendChild(b);
    setTimeout(() => b.remove(), kind === 'five' ? 2600 : 1700);
  }

  function fiveCinematic(p: Player) {
    const mine = p.id === me;
    audio.play('five');
    flash('five');
    shake('hard');
    vibrate([60, 40, 60, 40, 200]);
    scene.celebrate();
    fx().rain(['#00f0ff', '#ff2bd6', '#b6ff3b', '#ffb000', '#9d4dff'], settings.quality === 'low' ? 60 : 160);
    fx().burst(window.innerWidth / 2, window.innerHeight * 0.7, ['#ffffff', '#00f0ff', '#ff2bd6'], 60, 1.6);
    banner('FÜNF GLEICHE!', 'five', mine ? 'Unglaublich!' : `${p.name} hat zugeschlagen`);
  }

  function processEvent(e: GameEvent, s: GameState, latestRoll: number) {
    const p = s.players.find((x) => 'pid' in e && x.id === e.pid);
    const mine = p?.id === me;
    switch (e.type) {
      case 'start':
        resultsShown = false;
        closeResults?.();
        closeResults = null;
        viewId = me;
        break;
      case 'turn':
        endSelect();
        pendingGather = true;
        viewId = s.players.some((x) => x.id === me) && e.pid === me ? me : e.pid;
        if (mine) {
          audio.play('myturn');
          vibrate([20, 50, 20]);
          banner('DU BIST DRAN', 'turn');
        } else audio.play('turn');
        break;
      case 'roll': {
        if (e.seq !== latestRoll) break; // nur den neuesten Wurf animieren
        audio.play('roll');
        rolling = true;
        const rolled = e.held.map((x) => !x);
        const isFive = counts(e.dice).some((c) => c === 5);
        scene.roll(e.dice, rolled, () => {
          rolling = false;
          // Halten, das während des Flugs ankam, jetzt nachziehen
          if (state) scene.show(state.turn.dice, state.turn.held, state.turn.locked);
          if (isFive && p) fiveCinematic(p);
          else if (p && score(e.dice, 'largeStraight') && rolled.some(Boolean)) {
            audio.play('big');
            banner('GROSSE STRASSE!', 'big');
          }
          render();
        });
        break;
      }
      case 'hold':
        if (!mine) audio.play('lock');
        break;
      case 'module': {
        audio.play('module');
        if (e.die !== undefined) scene.pulse(e.die);
        const m = ENERGY.MODULES[e.id];
        if (!mine && p) toast(`${p.name} zündet ${m.name}`, 'info', 1800);
        else banner(m.name.toUpperCase(), 'good');
        flash('good');
        break;
      }
      case 'near': {
        if (!mine) break;
        audio.play('near');
        const txt = { five: 'Vier Gleiche – der fünfte fehlte!', large: 'Nur einer fehlte zur Großen Straße!', bonus: `Bonus um ${e.detail} Punkt${e.detail === 1 ? '' : 'e'} verpasst!` }[e.kind];
        banner('SO KNAPP!', 'near', txt);
        break;
      }
      case 'score': {
        if (!p) break;
        if (viewId === e.pid) {
          fresh = { col: e.col, cat: e.cat };
          if (freshTimer) clearTimeout(freshTimer);
          freshTimer = setTimeout(() => {
            fresh = null;
            render();
          }, 1400);
        }
        if (e.x) audio.play('scratch');
        else audio.play('score');
        if (e.auto && mine) toast('Zeit abgelaufen – automatisch eingetragen.', 'warn');
        const big: Partial<Record<Cat, string>> = { largeStraight: 'GROSSE STRASSE', smallStraight: 'KLEINE STRASSE', fullHouse: 'VOLLES HAUS', fiveKind: 'FÜNF GLEICHE' };
        if (!e.x && big[e.cat] && (mine || e.cat === 'fiveKind')) banner(`${big[e.cat]} +${e.p}`, e.cat === 'fiveKind' ? 'bonus' : 'good');
        if (e.bonus) {
          setTimeout(() => {
            audio.play('bonus');
            banner(`BONUS +${RULES.UPPER_BONUS}`, 'bonus', mine ? 'Oberer Teil geknackt!' : p.name);
            fx().burst(window.innerWidth / 2, window.innerHeight * 0.35, ['#b6ff3b', '#00f0ff'], 40, 1.2);
          }, 450);
        }
        if (e.streak >= 2 && e.good) {
          setTimeout(() => audio.play('combo', e.streak), 200);
          if (mine) {
            streakTag.textContent = `COMBO ×${e.streak}`;
            streakTag.classList.remove('hidden', 'pop');
            void streakTag.offsetWidth;
            streakTag.classList.add('pop');
          }
        }
        if (mine && e.energy > 0) {
          requestAnimationFrame(() => {
            const cell = blockHost.querySelector('.bval.fresh');
            fx().orbs(centerOf(cell), centerOf(coreBtn), '#ffe14d', Math.min(14, 4 + Math.round(e.energy / 5)));
            setTimeout(() => {
              coreBtn.classList.remove('charged');
              void coreBtn.offsetWidth;
              coreBtn.classList.add('charged');
            }, 650);
          });
        }
        if (mine && e.good && !e.x) {
          requestAnimationFrame(() => {
            const cell = blockHost.querySelector('.bval.fresh');
            fx().burst(centerOf(cell).x, centerOf(cell).y, ['#00f0ff', '#ff2bd6'], 14, 0.6);
          });
        }
        break;
      }
      case 'over':
        if (resultsTimer) clearTimeout(resultsTimer);
        resultsTimer = setTimeout(() => openResults(), 1300);
        break;
    }
  }

  function openResults() {
    if (disposed || !state || state.phase !== 'over' || resultsShown) return;
    resultsShown = true;
    audio.setIntensity(0);
    closeResults = showResults(app, link, state, {
      onBlocks: () => {
        closeResults = null;
      },
    });
  }

  // ---------- Darstellung ----------
  function render() {
    const s = state;
    if (!s) return;
    const cur = currentPlayer(s);
    const myTurn = isMyTurn();
    const mp = meP();
    const rank = ranking(s);

    // Chips
    chips.replaceChildren(
      ...s.players.map((p) => {
        const sc = totalScore(p.cols);
        const place = rank.filter((x) => totalScore(x.cols) > sc).length + 1;
        return h(
          'button',
          {
            type: 'button',
            role: 'tab',
            'aria-selected': String(viewId === p.id),
            'data-pid': p.id,
            class: `chip-p ${p.id === cur.id && s.phase === 'playing' ? 'active' : ''} ${viewId === p.id ? 'viewing' : ''} ${p.connected ? '' : 'offline'} ${p.streak >= 3 ? 'hot' : ''}`,
            onclick: (() => {
              viewId = p.id;
              audio.play('select');
              render();
            }) as EventListener,
          },
          avatar(p.name, p.look, { bot: !!p.bot && !p.standIn, size: 'sm', active: p.id === cur.id }),
          h('span', { class: 'chip-txt' }, h('span', { class: 'chip-name' }, p.id === me ? 'Du' : p.name), h('b', { class: 'chip-score' }, String(sc))),
          s.players.length > 1 ? h('span', { class: `chip-rank r${place}` }, place === 1 ? '♛' : `#${place}`) : null,
        );
      }),
    );

    // Ticker
    const turnsDone = Math.floor(s.turnNo / Math.max(1, s.players.length));
    const total = turnsPerPlayer(s);
    if (s.phase === 'over') turnText.textContent = 'SPIEL BEENDET';
    else if (myTurn) turnText.innerHTML = `<b class="you">DU BIST DRAN</b>`;
    else turnText.textContent = `${cur.name}${cur.bot && !cur.standIn ? ' (Bot)' : ''} ist dran`;
    if (mp && s.players.length > 1) {
      const myScore = totalScore(mp.cols);
      const ahead = rank.filter((x) => totalScore(x.cols) > myScore);
      if (!ahead.length) {
        const second = rank.find((x) => x.id !== me);
        const lead = myScore - (second ? totalScore(second.cols) : 0);
        rankHint.textContent = lead > 0 ? `Führung +${lead}` : 'Gleichstand';
      } else {
        const target = ahead[ahead.length - 1];
        const gap = totalScore(target.cols) - myScore + 1;
        rankHint.textContent = `Noch ${gap} bis Platz ${ahead.length} (${target.name})`;
      }
    } else rankHint.textContent = `Runde ${Math.min(total, turnsDone + 1)} / ${total}`;
    // Host: getrennten Spieler vertreten lassen
    ticker.querySelector('.takeover')?.remove();
    if (link.isHost && s.phase === 'playing' && !cur.connected && !cur.bot && !s.config.turnSeconds) {
      if (!disconnectedSince) disconnectedSince = Date.now();
      if (Date.now() - disconnectedSince > 15000) ticker.appendChild(button('Bot übernimmt', () => link.send({ a: 'takeover', pid: cur.id }), 'ghost small takeover'));
    } else disconnectedSince = 0;

    // Block
    if (!s.players.some((p) => p.id === viewId)) viewId = s.players[0].id;
    if (myTurn && s.turn.rolls > 0) viewId = me;
    const vp = s.players.find((p) => p.id === viewId)!;
    const showPreview = myTurn && viewId === me && s.turn.rolls > 0 && !rolling && !select;
    const preview = showPreview ? scoreAll(s.turn.dice) : null;
    const suggestion = showPreview ? suggestCell(vp, s.turn.dice) : null;
    viewLabel.replaceChildren(
      h('span', null, vp.id === me ? 'DEIN BLOCK' : `BLOCK VON ${vp.name.toUpperCase()}`),
      h('b', null, `${totalScore(vp.cols)} Pkt`),
      s.config.modules ? h('span', { class: 'mini-energy', title: 'Energie' }, `⚡${vp.energy}`) : '',
    );
    const scrollTop = blockWrap.scrollTop;
    blockHost.replaceChildren(
      renderBlock(vp, {
        preview,
        suggestion,
        onPick: showPreview ? pick : undefined,
        fresh,
        focusCol: s.config.mode === 'marathon' ? focusCol : undefined,
        onFocusCol: (c) => {
          focusCol = c;
          render();
        },
      }),
    );
    blockWrap.scrollTop = scrollTop;
    blockWrap.classList.toggle('picking', showPreview);

    // Würfelschale
    const t = s.turn;
    scene.setInteractive(myTurn && t.rolls > 0 && !rolling);
    scene.setStreak(cur.streak);
    const skin = cur.look.skin;
    scene.setSkin(cur.id === me ? settings.skin : skin, settings.colorblind);
    rollPips.replaceChildren(...Array.from({ length: t.maxRolls }, (_, i) => h('i', { class: i < t.rolls ? 'used' : '' })));
    if (s.phase !== 'playing') dockHint.textContent = '';
    else if (select) dockHint.textContent = '';
    else if (myTurn) dockHint.textContent = t.rolls === 0 ? 'Würfeln: Button, nach oben wischen oder Handy schütteln' : t.rolls < t.maxRolls ? 'Tippe Würfel zum Halten · dann neu würfeln oder Feld wählen' : 'Wähle ein Feld im Block';
    else dockHint.textContent = `${cur.name} würfelt …`;

    // Streak-Optik
    const streak = mp?.streak ?? 0;
    el.dataset.streak = String(Math.min(streak, 6));
    if (streak < 2) streakTag.classList.add('hidden');

    // Steuerung
    const rollsLeft = t.maxRolls - t.rolls;
    rollBtn.disabled = !canRoll();
    rollBtn.classList.toggle('ready', canRoll());
    rollLabel.textContent = !myTurn ? 'WARTEN' : rollsLeft > 0 ? (t.rolls === 0 ? 'WÜRFELN' : 'NOCHMAL') : 'FELD WÄHLEN';
    rollSub.textContent = myTurn ? `${rollsLeft} ${rollsLeft === 1 ? 'Wurf' : 'Würfe'} übrig` : '';
    bestBtn.classList.toggle('hidden', !showPreview);
    const energy = mp?.energy ?? 0;
    coreBtn.classList.toggle('off', !s.config.modules);
    coreBtn.style.setProperty('--e', String(energy / ENERGY.MAX));
    coreVal.textContent = s.config.modules ? String(energy) : '–';
    const anyUsable = mp && myTurn && s.config.modules && MODULE_IDS.some((id) => !canUseModule(s, mp, id));
    coreBtn.classList.toggle('usable', !!anyUsable);
  }

  function updateTimer() {
    const s = state;
    if (!s || s.phase !== 'playing' || !s.turn.deadline) {
      timer.classList.add('hidden');
      return;
    }
    timer.classList.remove('hidden');
    const left = s.turn.deadline - Date.now();
    const pct = Math.max(0, Math.min(1, left / (s.config.turnSeconds * 1000)));
    timerBar.style.width = `${pct * 100}%`;
    timer.classList.toggle('urgent', left < 10000);
    if (isMyTurn() && left < 5500 && left > 0) {
      const sec = Math.ceil(left / 1000);
      if (sec !== lastTick) {
        lastTick = sec;
        audio.play('tick');
      }
    }
  }

  function onState(s: GameState) {
    const first = state === null;
    state = s;
    if (s.phase === 'lobby') {
      app.go(lobbyScreen);
      return;
    }
    // Neue Partie (Revanche), deren Start-Ereignis wir evtl. verpasst haben
    if (!first && s.gameNo !== gameNo) {
      resultsShown = false;
      closeResults?.();
      closeResults = null;
      lastSeq = -1;
    }
    gameNo = s.gameNo;
    // Zu viele verpasste Ereignisse: nicht nachspielen, nur übernehmen
    if (lastSeq >= 0 && s.events.length && s.events[0].seq > lastSeq + 1) lastSeq = -1;
    if (first || lastSeq < 0) {
      // Einstieg / Reconnect: keine alten Ereignisse abspielen
      lastSeq = s.seq;
      scene.show(s.turn.dice, s.turn.held, s.turn.locked, true);
      viewId = s.players.some((p) => p.id === me) ? (currentPlayer(s).id === me || s.phase !== 'playing' ? me : currentPlayer(s).id) : currentPlayer(s).id;
      render();
      if (s.phase === 'over') resultsTimer = setTimeout(() => openResults(), 400);
      return;
    }
    const fresh = s.events.filter((e) => e.seq > lastSeq);
    lastSeq = s.seq;
    const latestRoll = [...fresh].reverse().find((e) => e.type === 'roll')?.seq ?? -1;
    for (const e of fresh) processEvent(e, s, latestRoll);
    if (!rolling) {
      scene.show(s.turn.dice, s.turn.held, s.turn.locked);
      if (pendingGather) scene.gather();
    }
    pendingGather = false;
    render();
  }

  // ---------- Eingaben ----------
  let lastShake = 0;
  const onMotion = (e: DeviceMotionEvent) => {
    if (!settings.shake) return;
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    const mag = a && a.x !== null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : g ? Math.max(0, Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : 0;
    const now = Date.now();
    if (mag > 16 && now - lastShake > 1300 && canRoll()) {
      lastShake = now;
      doRoll();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (document.querySelector('.sheet-wrap')) return;
      e.preventDefault();
      doRoll();
    } else if (/^[1-5]$/.test(e.key)) onDieTap(Number(e.key) - 1);
    else if (e.key === 'Escape' && select) endSelect();
  };
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('keydown', onKey);

  const setNet = (st: LinkStatus, detail?: string) => {
    statusDot.className = `net-dot st-${st}`;
    statusDot.title = STATUS_TEXT[st];
    if (st === 'reconnecting' && link.online) toast(STATUS_TEXT[st], 'warn', 1800);
    if (st === 'error' && detail) toast(detail, 'bad', 4000);
  };

  const off = link.on((ev) => {
    switch (ev.type) {
      case 'state':
        onState(ev.state);
        break;
      case 'status':
        setNet(ev.status, ev.detail);
        break;
      case 'emote':
        showEmote(ev.from, ev.e);
        break;
      case 'error':
        audio.play('error');
        toast(ev.msg, 'warn');
        break;
      case 'rematchReq': {
        const p = state?.players.find((x) => x.id === ev.from);
        toast(`${p?.name ?? 'Jemand'} möchte eine Revanche!`, 'good', 3000);
        break;
      }
      case 'rejected': {
        toast(REJECT_TEXT[ev.reason], 'bad', 4000);
        leaveSession(link);
        app.setLink(null);
        closeResults?.();
        app.go(startScreen);
        break;
      }
    }
  });
  const offSettings = onSettings(() => {
    scene.setQuality(settings.quality);
    applyTheme();
    render();
  });
  const timerInt = setInterval(() => {
    updateTimer();
    if (link.isHost && state && !currentPlayer(state).connected) render();
  }, 250);

  setNet(link.status);
  if (link.state) onState(link.state);
  else {
    turnText.textContent = 'Verbinde …';
  }

  el.cleanup = () => {
    disposed = true;
    if (resultsTimer) clearTimeout(resultsTimer);
    off();
    offSettings();
    clearInterval(timerInt);
    window.removeEventListener('devicemotion', onMotion);
    window.removeEventListener('keydown', onKey);
    scene.dispose();
    closeResults?.();
  };
  return el;
}

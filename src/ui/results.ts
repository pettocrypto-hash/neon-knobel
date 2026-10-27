import { audio } from '../audio/audio';
import { applyGameResult, levelInfo, profile } from '../app/profile';
import { leaveSession } from '../app/session';
import { vibrate } from '../app/settings';
import { ranking } from '../game/engine';
import { columnSums, totalScore } from '../game/scoring';
import type { GameState } from '../game/types';
import type { GameLink } from '../net/link';
import type { App } from './app';
import { button, h, toast } from './dom';
import { fx } from './fx';
import { startScreen } from './menus';
import { avatar, levelBar } from './widgets';

/** Siegerehrung mit Rangliste, XP, Level-Aufstieg und Erfolgen. Gibt eine Schließen-Funktion zurück. */
export function showResults(app: App, link: GameLink, s: GameState, opts: { onBlocks: () => void }): () => void {
  const me = link.me;
  const rank = ranking(s);
  const reward = applyGameResult(s, me);
  const myScore = totalScore(s.players.find((p) => p.id === me)?.cols ?? []);
  const place = rank.filter((x) => totalScore(x.cols) > myScore).length + 1;
  const multi = s.players.length > 1;
  const won = multi && place === 1;

  const title = !multi ? 'ENDSTAND' : won ? 'SIEG!' : `PLATZ ${place}`;
  const list = h(
    'ol',
    { class: 'podium' },
    ...rank.map((p, i) => {
      const sc = totalScore(p.cols);
      const pl = rank.filter((x) => totalScore(x.cols) > sc).length + 1;
      const bonus = p.cols.filter((c) => columnSums(c).bonus).length;
      return h(
        'li',
        { class: `pod p${pl} ${p.id === me ? 'me' : ''}`, style: `--d:${i * 0.12}s` },
        h('span', { class: 'pod-place' }, pl === 1 ? '♛' : String(pl)),
        avatar(p.name, p.look, { bot: !!p.bot && !p.standIn, size: 'sm' }),
        h('span', { class: 'pod-name' }, h('b', null, p.id === me ? `${p.name} (du)` : p.name), h('small', null, `${p.stats.fiveKinds}× 5 Gleiche · Bonus ${bonus}/${p.cols.length} · Streak ${p.stats.bestStreak}`)),
        h('b', { class: 'pod-score' }, String(sc)),
      );
    }),
  );

  const rewardBox = h('div', { class: 'reward' });
  if (reward) {
    const lvStart = levelInfo(Math.max(0, profile.xp - reward.xp));
    const bar = levelBar(lvStart.level, lvStart.pct);
    rewardBox.append(
      h('div', { class: 'xp-head' }, h('span', { class: 'label' }, 'ERFAHRUNG'), h('b', { class: 'xp-gain' }, `+${reward.xp} XP`)),
      h('ul', { class: 'xp-list' }, ...reward.breakdown.map((b) => h('li', null, h('span', null, b.label), h('b', null, `+${b.xp}`)))),
      bar,
    );
    if (reward.newRecord) rewardBox.append(h('div', { class: 'reward-tag record' }, '★ Neuer persönlicher Rekord!'));
    if (reward.daily) rewardBox.append(h('div', { class: 'reward-tag daily' }, '✓ Tages-Challenge geschafft'));
    if (reward.levelAfter > reward.levelBefore) rewardBox.append(h('div', { class: 'reward-tag level' }, `LEVEL ${reward.levelAfter} ERREICHT`));
    for (const u of reward.unlocked) rewardBox.append(h('div', { class: 'reward-tag unlock' }, `🔓 Freigeschaltet: ${u}`));
    for (const a of reward.achievements) rewardBox.append(h('div', { class: 'reward-tag ach' }, h('b', null, `🏆 ${a.name}`), h('small', null, a.desc)));
    // Balken animieren
    setTimeout(() => {
      const after = levelInfo();
      const fill = bar.querySelector('.lvl-fill') as HTMLElement;
      const num = bar.querySelector('.lvl-num') as HTMLElement;
      if (after.level > lvStart.level) {
        fill.style.width = '100%';
        setTimeout(() => {
          audio.play('levelup');
          vibrate([30, 30, 60]);
          num.textContent = `LV ${after.level}`;
          fill.style.transition = 'none';
          fill.style.width = '0%';
          void fill.offsetWidth;
          fill.style.transition = '';
          fill.style.width = `${after.pct * 100}%`;
        }, 700);
      } else fill.style.width = `${after.pct * 100}%`;
    }, 600);
  }

  const actions = h('div', { class: 'res-actions' });
  if (link.isHost) {
    actions.append(button('REVANCHE', () => link.send({ a: 'rematch' }), 'primary big'));
    if (link.online) actions.append(button('Zurück in die Lobby', () => link.send({ a: 'toLobby' }), 'ghost'));
  } else {
    actions.append(
      button(
        'REVANCHE ANFRAGEN',
        () => {
          link.requestRematch();
          toast('Anfrage an den Host gesendet.', 'good');
        },
        'primary big',
      ),
    );
  }
  actions.append(
    h(
      'div',
      { class: 'row' },
      button('Blöcke ansehen', () => {
        close();
        opts.onBlocks();
      }, 'ghost'),
      button('Hauptmenü', () => {
        close();
        leaveSession(link);
        app.setLink(null);
        app.go(startScreen);
      }, 'ghost'),
    ),
  );

  const wrap = h(
    'div',
    { class: `results ${won ? 'won' : ''}` },
    h('div', { class: 'results-inner' }, h('h1', { class: 'glitch res-title', 'data-text': title }, title), h('p', { class: 'res-sub' }, `${myScore} Punkte · ${s.config.mode === 'classic' ? 'Klassik' : 'Marathon'}${s.config.modules ? '' : ' · Purist'}`), list, rewardBox, actions),
  );
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  if (won || !multi) {
    audio.play('win');
    fx().rain(['#00f0ff', '#ff2bd6', '#b6ff3b', '#ffb000'], 120);
  } else audio.play('lose');

  function close() {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 300);
  }
  return close;
}

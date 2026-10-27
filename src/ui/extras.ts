import { FRAMES, SKINS, THEMES } from '../app/cosmetics';
import { ACHIEVEMENTS, dailyState, favoriteCategory, isFrameUnlocked, isSkinUnlocked, isThemeUnlocked, levelInfo, profile } from '../app/profile';
import { myLook } from '../app/session';
import { settings, updateSettings } from '../app/settings';
import { ENERGY, RULES } from '../config/rules';
import { CATS, CAT_HINT, CAT_LABEL, score } from '../game/scoring';
import type { App } from './app';
import { button, h, screenHeader, segmented, slider, toast, toggle } from './dom';
import { startScreen } from './menus';
import { avatar, dieFace, levelBar } from './widgets';

export function achievementsScreen(app: App): HTMLElement {
  const got = ACHIEVEMENTS.filter((a) => profile.achievements[a.id]).length;
  return h(
    'section',
    { class: 'page' },
    screenHeader('Erfolge', () => app.go(startScreen), h('span', { class: 'chip' }, `${got}/${ACHIEVEMENTS.length}`)),
    h(
      'div',
      { class: 'ach-list' },
      ...ACHIEVEMENTS.map((a) => {
        const done = !!profile.achievements[a.id];
        const secret = a.hidden && !done;
        return h(
          'div',
          { class: `ach panel ${done ? 'done' : ''} ${secret ? 'secret' : ''}` },
          h('span', { class: 'ach-icon' }, done ? '🏆' : secret ? '?' : '◇'),
          h('span', { class: 'ach-text' }, h('b', null, secret ? 'Versteckter Erfolg' : a.name), h('small', null, secret ? 'Spiel weiter, um ihn zu entdecken.' : a.desc)),
          done ? h('small', { class: 'ach-date' }, new Date(profile.achievements[a.id]).toLocaleDateString('de-DE')) : null,
        );
      }),
    ),
  );
}

export function statsScreen(app: App): HTMLElement {
  const st = profile.stats;
  const avg = st.games ? Math.round(st.totalScore / st.games) : 0;
  const tile = (label: string, value: string | number) => h('div', { class: 'stat panel' }, h('b', null, String(value)), h('small', null, label));
  return h(
    'section',
    { class: 'page' },
    screenHeader('Statistik', () => app.go(startScreen)),
    h(
      'div',
      { class: 'stat-grid' },
      tile('Partien', st.games),
      tile('Siege (Mehrspieler)', `${st.wins}/${st.mpGames}`),
      tile('Bestwert Klassik', st.bestClassic || '–'),
      tile('Bestwert Marathon', st.bestMarathon || '–'),
      tile('Ø Punkte', avg || '–'),
      tile('5 Gleiche gesamt', st.fiveKinds),
      tile('Große Straßen', st.largeStraights),
      tile('Bonus erreicht', st.bonusCols),
      tile('Module gezündet', st.modules),
      tile('Bester Streak', st.bestStreak),
      tile('Lieblings-Kategorie', favoriteCategory()),
      tile('Tages-Streak', `🔥 ${dailyState().streak}`),
    ),
    h('h3', { class: 'label' }, 'Letzte Partien'),
    st.history.length
      ? h(
          'div',
          { class: 'history panel' },
          ...st.history.map((g) =>
            h(
              'div',
              { class: `hist ${g.won ? 'won' : ''}` },
              h('span', null, new Date(g.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })),
              h('span', null, g.mode === 'classic' ? 'Klassik' : 'Marathon'),
              h('span', null, g.players > 1 ? `Platz ${g.rank}/${g.players}` : 'Solo'),
              h('b', null, String(g.score)),
            ),
          ),
        )
      : h('p', { class: 'hint center' }, 'Noch keine Partie gespielt.'),
  );
}

export function collectionScreen(app: App): HTMLElement {
  const lv = levelInfo();
  const el = h('section', { class: 'page' });
  const render = () => {
    el.replaceChildren(
      screenHeader('Sammlung', () => app.go(startScreen)),
      h('div', { class: 'panel profile-card' }, avatar(settings.name || '?', myLook(), { size: 'lg' }), h('div', { class: 'profile-main' }, h('b', { class: 'pname' }, settings.name || 'Spieler'), levelBar(lv.level, lv.pct, `${lv.into} / ${lv.need} XP`))),
      h('h3', { class: 'label' }, 'Würfel-Skins'),
      h(
        'div',
        { class: 'skin-grid' },
        ...SKINS.map((s) => {
          const ok = isSkinUnlocked(s.id);
          return h(
            'button',
            {
              type: 'button',
              class: `skin ${ok ? '' : 'locked'} ${settings.skin === s.id ? 'sel' : ''}`,
              style: `--sk-body:${s.body};--sk-pip:${s.pip};--sk-edge:${s.edge}`,
              onclick: (() => {
                if (!ok) return toast(s.daily ? '7 Tage Challenge-Streak schaltet ihn frei.' : `Ab Level ${s.level}`, 'info');
                updateSettings({ skin: s.id });
                render();
              }) as EventListener,
            },
            h('span', { class: 'skin-die' }, dieFace(5)),
            h('b', null, s.name),
            h('small', null, ok ? (settings.skin === s.id ? 'Aktiv' : 'Wählen') : s.daily ? '🔒 7-Tage-Streak' : `🔒 Level ${s.level}`),
          );
        }),
      ),
      h('h3', { class: 'label' }, 'Block-Themes'),
      h(
        'div',
        { class: 'theme-grid' },
        ...THEMES.map((t) => {
          const ok = isThemeUnlocked(t.id);
          return h(
            'button',
            {
              type: 'button',
              class: `theme ${ok ? '' : 'locked'} ${settings.theme === t.id ? 'sel' : ''}`,
              style: `--ta:${t.a};--tb:${t.b}`,
              onclick: (() => {
                if (!ok) return toast(`Ab Level ${t.level}`, 'info');
                updateSettings({ theme: t.id });
                render();
              }) as EventListener,
            },
            h('span', { class: 'theme-sw' }),
            h('b', null, t.name),
            h('small', null, ok ? '' : `🔒 Level ${t.level}`),
          );
        }),
      ),
      h('h3', { class: 'label' }, 'Profil-Rahmen'),
      h(
        'div',
        { class: 'frame-grid' },
        ...FRAMES.map((f) => {
          const ok = isFrameUnlocked(f.id);
          return h(
            'button',
            {
              type: 'button',
              class: `frame-opt ${ok ? '' : 'locked'} ${settings.frame === f.id ? 'sel' : ''}`,
              onclick: (() => {
                if (!ok) return toast(`Ab Level ${f.level}`, 'info');
                updateSettings({ frame: f.id });
                render();
              }) as EventListener,
            },
            avatar(settings.name || '?', { ...myLook(), frame: f.id }, { size: 'sm' }),
            h('b', null, f.name),
            h('small', null, ok ? '' : `🔒 Level ${f.level}`),
          );
        }),
      ),
    );
  };
  render();
  return el;
}

export function settingsScreen(app: App): HTMLElement {
  return h(
    'section',
    { class: 'page' },
    screenHeader('Optionen', () => app.go(startScreen)),
    h(
      'div',
      { class: 'panel' },
      h('h3', { class: 'label' }, 'Sound'),
      toggle('Ton aus (alles)', settings.muted, (v) => updateSettings({ muted: v })),
      toggle('Musik', settings.musicOn, (v) => updateSettings({ musicOn: v })),
      slider('Musik-Lautstärke', settings.music, (v) => updateSettings({ music: v })),
      toggle('Effekte', settings.sfxOn, (v) => updateSettings({ sfxOn: v })),
      slider('Effekt-Lautstärke', settings.sfx, (v) => updateSettings({ sfx: v })),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', { class: 'label' }, 'Spiel'),
      toggle('Eintragen bestätigen', settings.confirmScore, (v) => updateSettings({ confirmScore: v }), 'Kurze Rückfrage gegen Vertippen'),
      toggle('Schütteln zum Würfeln', settings.shake, (v) => updateSettings({ shake: v })),
      toggle('Vibration', settings.vibrate, (v) => updateSettings({ vibrate: v })),
      toggle('Emotes stumm', settings.emotesMuted, (v) => updateSettings({ emotesMuted: v })),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', { class: 'label' }, 'Darstellung & Barrierefreiheit'),
      toggle('Farbenblind-Modus', settings.colorblind, (v) => updateSettings({ colorblind: v }), 'Ziffern auf den Würfeln, Symbole statt nur Farben'),
      toggle('Weniger Bewegung', settings.reduceMotion, (v) => updateSettings({ reduceMotion: v }), 'Kein Wackeln, kürzere Würfel-Animation'),
      h('h3', { class: 'label' }, 'Grafikqualität'),
      segmented(
        [
          { value: 'low', label: 'Sparsam' },
          { value: 'medium', label: 'Mittel' },
          { value: 'high', label: 'Hoch', sub: 'mit Glow' },
        ],
        settings.quality,
        (v) => updateSettings({ quality: v as typeof settings.quality }),
      ),
    ),
    button(
      'Profil zurücksetzen',
      () => {
        if (!confirm('Wirklich XP, Erfolge und Statistik löschen?')) return;
        localStorage.removeItem('neonknobel.profile');
        location.reload();
      },
      'danger small',
    ),
  );
}

export function rulesScreen(app: App): HTMLElement {
  const ex = (dice: number[], cat: (typeof CATS)[number]) => h('div', { class: 'rule-ex' }, h('span', { class: 'rule-dice' }, ...dice.map((d) => dieFace(d))), h('b', null, `${score(dice, cat)}`));
  const examples: Record<string, number[]> = {
    ones: [1, 1, 3, 4, 1],
    twos: [2, 2, 5, 6, 1],
    threes: [3, 3, 3, 1, 6],
    fours: [4, 4, 2, 4, 4],
    fives: [5, 1, 5, 2, 3],
    sixes: [6, 6, 6, 2, 1],
    pair: [6, 6, 1, 3, 4],
    twoPairs: [5, 5, 2, 2, 6],
    three: [4, 4, 4, 2, 6],
    four: [5, 5, 5, 5, 6],
    fullHouse: [3, 3, 2, 2, 2],
    smallStraight: [1, 2, 3, 4, 6],
    largeStraight: [2, 3, 4, 5, 6],
    fiveKind: [6, 6, 6, 6, 6],
    chance: [6, 5, 4, 2, 6],
  };
  return h(
    'section',
    { class: 'page rules' },
    screenHeader('Regeln', () => app.go(startScreen)),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Ablauf'),
      h(
        'p',
        null,
        `Du hast pro Zug bis zu ${RULES.MAX_ROLLS} Würfe mit 5 Würfeln. Nach jedem Wurf kannst du Würfel antippen, um sie zu halten. Danach musst du genau ein freies Feld im Block wählen. Passt nichts, streichst du ein Feld (0 Punkte). Gespielt wird reihum, bis alle Felder voll sind.`,
      ),
      h('p', null, `Oberer Teil: Erreichst du mindestens ${RULES.UPPER_BONUS_THRESHOLD} Punkte, gibt es +${RULES.UPPER_BONUS} Bonus. 1 Paar, 2 Paar, Drei und Vier Gleiche zählen die Summe aller fünf Würfel. 5 Gleiche zählt auch als Volles Haus, Vier Gleiche auch als 2 Paar.`),
      h('p', null, 'Marathon: 7 Spalten mit allen Kategorien. Du wählst in jeder Runde frei, in welche Spalte du einträgst. Die Endsumme ist die Summe aller Spalten.'),
    ),
    h('div', { class: 'panel' }, h('h3', null, 'Kategorien'), ...CATS.map((c) => h('div', { class: 'rule-row' }, h('span', { class: 'rule-name' }, h('b', null, CAT_LABEL[c]), h('small', null, CAT_HINT[c])), ex(examples[c], c)))),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Energie-Kern & Module'),
      h('p', null, 'Starke Züge laden deinen Energie-Kern auf: Große Straße, 5 Gleiche, Bonus, Volles Haus, Combo-Streaks. Mit Energie zündest du Module (je Modul einmal pro Zug, begrenzte Einsätze pro Partie):'),
      ...Object.values(ENERGY.MODULES).map((m) => h('div', { class: 'rule-row' }, h('span', { class: 'rule-name' }, h('b', null, `${m.icon} ${m.name}`), h('small', null, m.desc)), h('b', null, `⚡${m.cost}`))),
      h('p', { class: 'hint' }, 'Im Purist-Modus sind Module aus.'),
    ),
    h(
      'div',
      { class: 'panel' },
      h('h3', null, 'Combo-Streak & Fairness'),
      h('p', null, 'Mehrere starke Einträge hintereinander bauen einen Combo-Streak auf. Ab Streak 3 gibt es Extra-Energie, ab 4 brennen die Würfel blau. Ein schwacher Eintrag oder eine Streichung setzt ihn zurück.'),
      h('p', null, 'Gewürfelt wird nur auf dem Gerät des Hosts, das als Server dient. Mitspieler senden nur Wünsche (Halten, Würfeln, Eintragen) und können Würfe nicht manipulieren.'),
    ),
  );
}

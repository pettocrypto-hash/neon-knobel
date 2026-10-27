import { skinById } from '../app/cosmetics';
import { settings } from '../app/settings';
import type { Look } from '../game/types';
import { h } from './dom';

/** Avatar mit Profil-Rahmen (Initiale im Hexagon). */
export function avatar(name: string, look: Look, opts: { bot?: boolean; size?: 'sm' | 'md' | 'lg'; active?: boolean } = {}): HTMLElement {
  const skin = skinById(look.skin);
  const initial = opts.bot ? '◆' : (name.trim()[0] ?? '?').toUpperCase();
  return h(
    'div',
    {
      class: `avatar frame-${look.frame} av-${opts.size ?? 'md'} ${opts.active ? 'active' : ''}`,
      style: `--av-a:${skin.edge};--av-b:${skin.pip}`,
    },
    h('span', { class: 'av-hex' }, h('span', { class: 'av-init' }, initial)),
    h('span', { class: 'av-lvl' }, String(look.level)),
  );
}

/** Kleines 2D-Würfelsymbol (für Menüs und Vorschau). */
export function dieFace(value: number, cls = ''): HTMLElement {
  const pips: Record<number, number[]> = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const el = h('span', { class: `die2d ${cls}`, 'aria-label': `Würfel ${value}` });
  for (let i = 1; i <= 9; i++) el.appendChild(h('i', { class: pips[value]?.includes(i) ? 'on' : '' }));
  return el;
}

export function levelBar(level: number, pct: number, label?: string): HTMLElement {
  return h(
    'div',
    { class: 'lvl-bar' },
    h('span', { class: 'lvl-num' }, `LV ${level}`),
    h('span', { class: 'lvl-track' }, h('span', { class: 'lvl-fill', style: `width:${Math.round(pct * 100)}%` })),
    label ? h('span', { class: 'lvl-label' }, label) : null,
  );
}

export function logo(): HTMLElement {
  if (settings.design === 'clean')
    return h(
      'div',
      { class: 'logo' },
      h('div', { class: 'logo-dice' }, dieFace(5, 'logo-die a'), dieFace(6, 'logo-die b'), dieFace(3, 'logo-die c')),
      h('h1', { class: 'logo-title' }, 'Knobel'),
      h('p', { class: 'logo-sub' }, 'Würfeln · Eintragen · Gewinnen'),
    );
  return h(
    'div',
    { class: 'logo' },
    h('div', { class: 'logo-dice' }, dieFace(5, 'logo-die a'), dieFace(6, 'logo-die b'), dieFace(3, 'logo-die c')),
    h('h1', { class: 'glitch logo-title', 'data-text': 'NEON KNOBEL' }, 'NEON KNOBEL'),
    h('p', { class: 'logo-sub' }, 'Würfel · Block · Online'),
  );
}

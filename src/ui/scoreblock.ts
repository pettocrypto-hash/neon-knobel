import { RULES } from '../config/rules';
import { CATS, CAT_HINT, CAT_LABEL, CAT_SHORT, UPPER, columnSums, totalScore, type Cat } from '../game/scoring';
import type { Player } from '../game/types';
import { h } from './dom';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export interface BlockOptions {
  /** Punkte-Vorschau für die aktuellen Würfel (nur wenn ich am Zug bin und gewürfelt habe). */
  preview: Record<Cat, number> | null;
  suggestion: { col: number; cat: Cat } | null;
  onPick?: (col: number, cat: Cat) => void;
  /** Kurz aufleuchtendes, gerade eingetragenes Feld. */
  fresh?: { col: number; cat: Cat } | null;
  /** Hervorgehobene Spalte (Marathon). */
  focusCol?: number;
  onFocusCol?: (col: number) => void;
}

type Row = { kind: 'cat'; cat: Cat } | { kind: 'sum'; id: 'sub' | 'bonus' | 'upper' | 'lower' | 'total'; label: string; short: string };

const ROWS: Row[] = [
  ...UPPER.map((cat) => ({ kind: 'cat', cat }) as Row),
  { kind: 'sum', id: 'sub', label: 'Zwischensumme', short: 'Zw.-Summe' },
  { kind: 'sum', id: 'bonus', label: `Bonus (ab ${RULES.UPPER_BONUS_THRESHOLD})`, short: 'Bonus' },
  { kind: 'sum', id: 'upper', label: 'Summe Teil 1', short: 'Summe I' },
  ...CATS.filter((c) => !UPPER.includes(c)).map((cat) => ({ kind: 'cat', cat }) as Row),
  { kind: 'sum', id: 'lower', label: 'Summe Teil 2', short: 'Summe II' },
  { kind: 'sum', id: 'total', label: 'Endsumme', short: 'Endsumme' },
];

/** Spielblock als Tabelle. Bei 7 Spalten passt alles auf einen Handy-Bildschirm. */
export function renderBlock(p: Player, o: BlockOptions): HTMLElement {
  const nCols = p.cols.length;
  const multi = nCols > 1;
  const sums = p.cols.map(columnSums);
  const table = h('div', { class: `block ${multi ? 'multi' : 'single'}`, style: `--cols:${nCols}`, role: 'grid', 'aria-label': `Spielblock von ${p.name}` });

  // Kopfzeile
  const head = h('div', { class: 'brow bhead', role: 'row' }, h('div', { class: 'bcell blabel', role: 'columnheader' }, multi ? 'SPALTE' : 'KATEGORIE'));
  for (let c = 0; c < nCols; c++) {
    head.appendChild(
      h(
        'button',
        {
          type: 'button',
          class: `bcell bcolh ${o.focusCol === c ? 'focus' : ''} ${sums[c].done ? 'done' : ''}`,
          role: 'columnheader',
          onclick: (() => o.onFocusCol?.(c)) as EventListener,
        },
        multi ? ROMAN[c] : 'PUNKTE',
      ),
    );
  }
  table.appendChild(head);

  for (const row of ROWS) {
    if (row.kind === 'cat') {
      const ci = CATS.indexOf(row.cat);
      const r = h(
        'div',
        { class: `brow ${UPPER.includes(row.cat) ? 'upper' : 'lower'}`, role: 'row' },
        h('div', { class: 'bcell blabel', role: 'rowheader', title: CAT_HINT[row.cat] }, h('span', { class: 'lbl' }, multi ? CAT_SHORT[row.cat] : CAT_LABEL[row.cat]), !multi ? h('small', null, CAT_HINT[row.cat]) : null),
      );
      for (let c = 0; c < nCols; c++) {
        const cell = p.cols[c][ci];
        const isFresh = o.fresh && o.fresh.col === c && o.fresh.cat === row.cat;
        if (cell) {
          r.appendChild(
            h('div', { class: `bcell bval ${cell.x ? 'scratched' : 'filled'} ${isFresh ? 'fresh' : ''} ${o.focusCol === c ? 'focus' : ''}`, role: 'gridcell' }, cell.x ? h('span', { class: 'strike' }, '0') : String(cell.p)),
          );
          continue;
        }
        if (o.preview && o.onPick) {
          const pts = o.preview[row.cat];
          const best = o.suggestion && o.suggestion.col === c && o.suggestion.cat === row.cat;
          r.appendChild(
            h(
              'button',
              {
                type: 'button',
                class: `bcell bval open ${pts ? 'can' : 'zero'} ${best ? 'best' : ''} ${o.focusCol === c ? 'focus' : ''}`,
                role: 'gridcell',
                'aria-label': `${CAT_LABEL[row.cat]}${multi ? ` Spalte ${c + 1}` : ''}: ${pts ? `${pts} Punkte` : 'streichen'}`,
                onclick: (() => o.onPick!(c, row.cat)) as EventListener,
              },
              pts ? String(pts) : '✕',
            ),
          );
        } else {
          r.appendChild(h('div', { class: `bcell bval empty ${o.focusCol === c ? 'focus' : ''}`, role: 'gridcell' }));
        }
      }
      table.appendChild(r);
    } else {
      const r = h('div', { class: `brow bsum sum-${row.id}`, role: 'row' }, h('div', { class: 'bcell blabel', role: 'rowheader' }, multi ? row.short : row.label));
      for (let c = 0; c < nCols; c++) {
        const s = sums[c];
        let txt = '';
        let cls = '';
        switch (row.id) {
          case 'sub':
            txt = multi ? String(s.upperSub) : `${s.upperSub} / ${RULES.UPPER_BONUS_THRESHOLD}`;
            cls = s.bonus ? 'ok' : '';
            break;
          case 'bonus':
            if (s.bonus) {
              txt = `+${s.bonus}`;
              cls = 'ok';
            } else if (s.upperDone) {
              txt = '0';
              cls = 'miss';
            } else {
              txt = multi ? `-${s.bonusMissing}` : `noch ${s.bonusMissing}`;
              cls = 'pending';
            }
            break;
          case 'upper':
            txt = String(s.upperTotal);
            break;
          case 'lower':
            txt = String(s.lowerTotal);
            break;
          case 'total':
            txt = String(s.total);
            break;
        }
        r.appendChild(h('div', { class: `bcell bsumv ${cls} ${o.focusCol === c ? 'focus' : ''}`, role: 'gridcell' }, txt));
      }
      table.appendChild(r);
    }
  }
  if (multi) {
    table.appendChild(h('div', { class: 'brow bgrand', role: 'row' }, h('div', { class: 'bcell blabel' }, 'GESAMT (7 Spalten)'), h('div', { class: 'bcell bgrandv' }, String(totalScore(p.cols)))));
  }
  return table;
}

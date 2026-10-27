import { audio } from '../audio/audio';
import { vibrate } from '../app/settings';

type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | undefined | null> & {
  class?: string;
};

/** Minimaler DOM-Baukasten. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'html') el.innerHTML = String(v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

/** Neon-Button mit Klick-Sound und Haptik. */
export function button(label: string | Node, onClick: () => void, cls = '', attrs: Attrs = {}): HTMLButtonElement {
  return h(
    'button',
    {
      class: `btn ${cls}`,
      type: 'button',
      ...attrs,
      onclick: ((e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (b.disabled) return;
        audio.play('click');
        vibrate(8);
        onClick();
      }) as EventListener,
    },
    label,
  );
}

let toastHost: HTMLElement | null = null;

export function toast(text: string, kind: 'info' | 'good' | 'bad' | 'warn' = 'info', ms = 2400) {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts' });
    document.body.appendChild(toastHost);
  }
  const el = h('div', { class: `toast toast-${kind}` }, text);
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 400);
  }, ms);
}

export function confirmDialog(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (v: boolean) => {
      wrap.remove();
      resolve(v);
    };
    const wrap = h(
      'div',
      { class: 'modal-wrap' },
      h('div', { class: 'modal panel' }, h('p', { class: 'modal-text' }, text), h('div', { class: 'row' }, button(no, () => close(false), 'ghost'), button(yes, () => close(true), 'danger'))),
    );
    document.body.appendChild(wrap);
  });
}

/** Segmentierte Auswahl (z. B. Modus, Schwierigkeit). */
export function segmented<T extends string | number>(options: { value: T; label: string; sub?: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg' });
  const render = (cur: T) => {
    wrap.replaceChildren(
      ...options.map((o) =>
        h(
          'button',
          {
            type: 'button',
            class: `seg-btn ${o.value === cur ? 'active' : ''}`,
            onclick: (() => {
              audio.play('select');
              vibrate(6);
              render(o.value);
              onChange(o.value);
            }) as EventListener,
          },
          h('span', { class: 'seg-label' }, o.label),
          o.sub ? h('span', { class: 'seg-sub' }, o.sub) : null,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

export function glitchTitle(text: string, cls = ''): HTMLElement {
  return h('h1', { class: `glitch ${cls}`, 'data-text': text }, text);
}

export function flash(kind: 'good' | 'big' | 'bad' | 'five') {
  const el = h('div', { class: `screen-flash flash-${kind}` });
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

export function shake(strength: 'soft' | 'hard' = 'soft') {
  const el = document.getElementById('app');
  if (!el || document.documentElement.dataset.motion === 'reduce') return;
  el.classList.remove('shake-soft', 'shake-hard');
  void el.offsetWidth;
  el.classList.add(`shake-${strength}`);
  setTimeout(() => el.classList.remove(`shake-${strength}`), 700);
}

/** Bottom-Sheet / Modal mit beliebigem Inhalt. Gibt eine Schließen-Funktion zurück. */
export function sheet(content: HTMLElement, opts: { cls?: string; onClose?: () => void; dismissable?: boolean } = {}) {
  const wrap = h('div', { class: `sheet-wrap ${opts.cls ?? ''}` });
  const panel = h('div', { class: 'sheet panel' }, content);
  wrap.appendChild(panel);
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 250);
    opts.onClose?.();
  };
  if (opts.dismissable !== false)
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) close();
    });
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return close;
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, sub?: string): HTMLElement {
  const input = h('input', { type: 'checkbox', class: 'switch-input' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => {
    audio.play('select');
    vibrate(6);
    onChange(input.checked);
  });
  return h('label', { class: 'switch-row' }, h('span', { class: 'switch-text' }, h('span', null, label), sub ? h('small', null, sub) : null), input, h('span', { class: 'switch' }));
}

export function slider(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const input = h('input', { type: 'range', min: 0, max: 100, value: Math.round(value * 100), class: 'range' }) as HTMLInputElement;
  input.addEventListener('input', () => onChange(Number(input.value) / 100));
  return h('label', { class: 'slider-row' }, h('span', null, label), input);
}

export function screenHeader(title: string, onBack: () => void, right?: Node): HTMLElement {
  return h('header', { class: 'screen-head' }, button('‹', onBack, 'icon-btn back', { 'aria-label': 'Zurück' }), h('h2', null, title), right ?? h('span', { class: 'head-spacer' }));
}

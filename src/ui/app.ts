import type { GameLink } from '../net/link';

export type Screen = (app: App) => HTMLElement & { cleanup?: () => void };

/** Minimaler Screen-Router mit Übergangsanimation. */
export class App {
  link: GameLink | null = null;
  installPrompt: (Event & { prompt(): Promise<void> }) | null = null;
  private current: (HTMLElement & { cleanup?: () => void }) | null = null;

  constructor(readonly root: HTMLElement) {}

  go(screen: Screen) {
    const old = this.current;
    old?.cleanup?.();
    const el = screen(this);
    el.classList.add('screen', 'enter');
    this.root.appendChild(el);
    this.current = el;
    requestAnimationFrame(() => el.classList.remove('enter'));
    if (old) {
      old.classList.add('leave');
      setTimeout(() => old.remove(), 280);
    }
    window.scrollTo(0, 0);
  }

  setLink(link: GameLink | null) {
    this.link = link;
  }
}

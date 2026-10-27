import '@fontsource/orbitron/latin-500.css';
import '@fontsource/orbitron/latin-700.css';
import '@fontsource/orbitron/latin-900.css';
import '@fontsource/rajdhani/latin-500.css';
import '@fontsource/rajdhani/latin-600.css';
import '@fontsource/rajdhani/latin-700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { leaveSession, loadPointer, resumeSession } from './app/session';
import { applyDocumentSettings, onSettings, settings } from './app/settings';
import { normalizeRoomCode } from './net/protocol';
import { App } from './ui/app';
import { fx } from './ui/fx';
import { gameScreen } from './ui/game';
import { lobbyScreen } from './ui/lobby';
import { joinScreen, startScreen } from './ui/menus';

applyDocumentSettings();
fx().configure(settings.quality, settings.reduceMotion);
onSettings(() => fx().configure(settings.quality, settings.reduceMotion));

// Echte Viewport-Höhe (mobile Browserleisten) als CSS-Variable.
const setVh = () => document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
setVh();
window.addEventListener('resize', setVh);

// Doppeltipp-Zoom und Pinch auf der Seite unterbinden.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

const app = new App(document.getElementById('app')!);

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e as Event & { prompt(): Promise<void> };
});

if (import.meta.env.PROD) registerSW({ immediate: true });

// Einladungslink ?room=XXXX
const params = new URLSearchParams(location.search);
const roomParam = params.get('room');
if (roomParam) history.replaceState(null, '', location.pathname);
const room = roomParam ? normalizeRoomCode(roomParam) : null;
const ptr = loadPointer();

// Eigener Raum (als Host oder Gast) per Link geöffnet → einfach fortsetzen
const sameRoom = !!room && ptr?.room === room;
if (room && ptr && !sameRoom) {
  // Neuer Einladungslink: alte Sitzung verlassen
  leaveSession(null);
}

const resumed = room && !sameRoom ? null : resumeSession();
if (resumed) {
  app.setLink(resumed);
  const phase = resumed.state?.phase;
  app.go(phase && phase !== 'lobby' ? gameScreen : lobbyScreen);
} else if (room) {
  app.go((a) => joinScreen(a, room));
} else {
  app.go(startScreen);
}

// Für Tests/Debugging in der Konsole erreichbar.
(window as unknown as { neonknobel: App }).neonknobel = app;

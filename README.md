# NEON KNOBEL

Cyberpunk-Würfelspiel mit Spielblock fürs Handy. Bis zu 4 Spieler treten online per Raumcode, Link oder QR-Code bei, ohne Registrierung. Freie Plätze füllen Bots in drei Stärken. Es gibt echte 3D-Würfel, einen Energie-Kern mit Modulen, Combo-Streaks, XP, Skins, Tages-Challenges und Erfolge. Das Spiel läuft im Handy-Browser und lässt sich als App installieren (PWA).

## Schnellstart (am PC)

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20. Nimm auf der Seite die Version mit „LTS“ und installiere sie mit den Standard-Einstellungen.

1. Öffne den Projektordner im Terminal. Unter Windows geht das so: Ordner `Kniffel` im Explorer öffnen, oben in die Adresszeile `cmd` tippen und Enter drücken.
2. Einmalig die Abhängigkeiten installieren:
   ```bash
   npm install
   ```
3. Spiel starten:
   ```bash
   npm start
   ```
4. Im Browser `http://localhost:5173` öffnen. Im Terminal steht zusätzlich eine Adresse wie `http://192.168.x.x:5173`. Die kannst du im gleichen WLAN auf dem Handy öffnen.

Hinweis: Online-Spiele zwischen zwei Handys brauchen HTTPS. Lokal im WLAN klappt das Spiel gegen Bots immer. Für Online-Partien mit Freunden nimmst du den veröffentlichten Link (siehe unten).

| Befehl | Zweck |
| --- | --- |
| `npm start` / `npm run dev` | Entwicklungsserver mit Live-Neuladen |
| `npm test` | Unit-Tests (Punkte, Regeln, Module, komplette Bot-Partien) |
| `npm run build` | Typprüfung und fertige Version nach `dist/` |
| `npm run preview` | Fertige Version lokal testen (mit Offline-Modus) |
| `npm run icons` | App-Icons neu erzeugen |

## Spielen

- **Solo & Bots**: Modus, Timer und Module wählen, 0 bis 3 Bots hinzufügen (ohne Bots ist es Solo-Training auf Highscore).
- **Online erstellen**: Du bekommst einen 4-stelligen Raumcode, einen Link und einen QR-Code. Freie Plätze kannst du in der Lobby mit Bots füllen. Du startest, sobald alle „Bereit“ gedrückt haben.
- **Beitreten**: Code eingeben oder den Link bzw. QR-Code öffnen.
- **Würfeln**: Button, nach oben über die Würfel wischen oder das Handy schütteln. Würfel antippen hält sie fest.
- **Eintragen**: Nach dem Wurf leuchten alle freien Felder mit ihren Punkten auf, das beste ist mit ★ markiert. Feld antippen und bestätigen.
- **Verbindung weg?** Einfach weiterspielen bzw. die Seite neu öffnen. Alle Geräte verbinden sich automatisch wieder mit dem Raum.

Die kompletten Regeln stehen im Spiel unter **Regeln**. Alle Spielwerte (Punkte, Bonus, Energie, Modulkosten, XP) stehen in [`src/config/rules.ts`](src/config/rules.ts). Warum etwas so gebaut ist, steht in [`ENTSCHEIDUNGEN.md`](ENTSCHEIDUNGEN.md).

## Veröffentlichen auf GitHub Pages (kostenlos)

Der Workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ist schon dabei. Bei jedem Push auf `main` testet und baut er das Spiel und stellt es online.

1. Auf [github.com/new](https://github.com/new) ein neues Repository anlegen, Name z. B. `neon-knobel`. Auf „Public“ lassen und **kein** README hinzufügen. Dann **Create repository** klicken.
2. Im Projektordner:
   ```bash
   git remote add origin https://github.com/DEINNAME/neon-knobel.git
   git push -u origin main
   ```
3. Auf GitHub im Repository **Settings → Pages** öffnen und bei **Build and deployment → Source** „GitHub Actions“ wählen.
4. Unter **Actions** den Lauf „Deploy to GitHub Pages“ abwarten (ca. 1 Minute). Falls der erste Lauf vor Schritt 3 fehlgeschlagen ist, dort auf **Re-run all jobs** klicken.
5. Fertig: Das Spiel läuft unter `https://DEINNAME.github.io/neon-knobel/`.

### Auf zwei Handys spielen

1. Handy A: Link öffnen, Namen eingeben, **Online erstellen**, **Raum erstellen**.
2. Handy B: Den QR-Code von Handy A scannen oder den Link über „Link teilen“ schicken. Alternativ die Seite öffnen, **Beitreten** tippen und den 4-stelligen Code eingeben.
3. Handy B tippt **Ich bin bereit**, Handy A tippt **Spiel starten**.

### Als App installieren

- **Android (Chrome)**: Seite öffnen, Menü ⋮ → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
- **iPhone (Safari)**: Teilen-Symbol → **Zum Home-Bildschirm**. Auf dem iPhone fragt Safari beim ersten Würfeln, ob das Spiel Bewegungsdaten nutzen darf (für „Schütteln zum Würfeln“).

## Projektstruktur

```
src/
  config/   rules.ts – alle Regel- und Balancing-Werte
  game/     reine Spiellogik ohne UI: Punkte (scoring), Engine (Host-autoritativ), Bots, Typen
  net/      GameLink-Interface, Host (= Server im Browser), Gast, Protokoll
  app/      Einstellungen, Profil (XP, Erfolge, Challenges, Statistik), Skins, Sitzungen
  dice/     Three.js-Würfelschale mit eigener Mini-Physik, prozedurale Texturen
  audio/    Web-Audio-Synthesizer (Musik und Effekte)
  ui/       Screens: Menü, Lobby, Spiel, Spielblock, Ergebnis, Sammlung, Statistik …
tests/      scoring.test.ts (alle Kategorien, Randfälle), engine.test.ts (Regeln, Module, ganze Partien)
```

## Lizenzen

Schriften: Orbitron und Rajdhani (SIL Open Font License) über `@fontsource`. Grafik, Würfel-Texturen, Icons und Sound werden vollständig im Code erzeugt.

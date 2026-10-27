# Entscheidungen

## Was gebaut wird (Kurzfassung)

1. NEON KNOBEL ist ein Würfelspiel mit Spielblock im Cyberpunk-Look, gebaut als Web-App (PWA) fürs Handy im Hochformat.
2. Gespielt wird Klassik (1 Spalte) oder Marathon (7 Spalten, freie Spaltenwahl) mit 1 bis 4 Spielern, online per Raumcode, Link oder QR-Code, ohne Registrierung.
3. Die Würfel sind echte 3D-Würfel (Three.js), die durch die Schale rollen, aneinanderstoßen und auf dem vom Host gewürfelten Ergebnis liegen bleiben.
4. Ein Energie-Kern mit vier Modulen, Combo-Streaks, eine 5-Gleiche-Cinematic, XP und Level mit Skins, Tages-Challenges, 27 Erfolge und Statistiken sorgen für den „noch eine Runde“-Effekt.
5. Bots in drei Stärken füllen freie Plätze, und die Spiellogik ist mit Unit-Tests und kompletten Bot-Partien abgesichert.

## Name: NEON KNOBEL statt NEON KNIFFEL

„Kniffel“ ist eine eingetragene Marke. Damit du das Spiel ohne Ärger per Link teilen kannst, heißt es **NEON KNOBEL** („knobeln“ ist das allgemeine deutsche Wort für Würfelspiele). Aus demselben Grund heißt das Feld im Block **5 Gleiche**, wie auf deinem Beispielblock („5 x gleiche Augenzahl“).

## 15 statt 13 Felder pro Spalte

Das Briefing nennt 13 Runden (bzw. 91 im Marathon), listet aber 15 Kategorien auf (inklusive 1 Paar und 2 Paar wie auf deinem Block). Ich habe mich nach dem **Block** gerichtet: **15 Runden in Klassik, 105 im Marathon**. Jede Kategorie steht zentral in `src/game/scoring.ts`.

## Kein eigener Server: Der Host ist der Server

Das Briefing schlägt Node.js + WebSocket vor. Du hattest bei NEON FLEET aber GitHub Pages als Hosting gewählt, und GitHub Pages kann nur statische Seiten ausliefern. Deshalb gilt:

- Das Handy, das den Raum erstellt, **ist der Server**. Nur dort laufen Würfeln (`crypto.getRandomValues`), Zugreihenfolge, Gültigkeitsprüfung und Punkteberechnung (`src/game/engine.ts`).
- Mitspieler schicken nur Wünsche („würfeln“, „Würfel 3 halten“, „Dreier in Spalte II“) und bekommen den kompletten Zustand zurück. Sie können also weder würfeln noch Punkte fälschen.
- Die Verbindung läuft per WebRTC über den kostenlosen öffentlichen PeerJS-Vermittler (wie bei NEON FLEET). Hosting bleibt dadurch kostenlos, und `npm install` plus `npm start` reicht zum Starten.
- Einschränkung: Der Host selbst könnte theoretisch seinen eigenen Browser manipulieren. Für Spiele unter Freunden ist das vertretbar. Falls du später einen echten Server willst, ist das Netzwerk über das `GameLink`-Interface (`src/net/link.ts`) austauschbar.

## Reconnect

- Jedes Gerät hat eine dauerhafte Client-ID im `localStorage`, die zugleich als Reconnect-Token dient.
- Gäste verbinden sich bei Abbruch, App-Wechsel oder Netzwechsel automatisch mit Backoff neu und landen wieder auf ihrem Platz.
- Der Host speichert den Spielstand nach jeder Aktion. Lädt er die Seite neu, öffnet er denselben Raum wieder und alle Gäste verbinden sich von selbst.
- Ist ein Spieler ohne Zugtimer länger als 15 Sekunden weg, kann der Host einen Bot vertreten lassen. Kommt der Spieler zurück, übernimmt er wieder selbst.

## Regeldetails

- 1 Paar, 2 Paar, Drei und Vier Gleiche zählen die **Summe aller 5 Würfel** (Konstante `PAIR_SCORING` in `src/config/rules.ts`, umstellbar auf „nur die Kombination“).
- 5 Gleiche zählt auch als Volles Haus. Vier Gleiche zählen auch als 2 Paar. Beides ist per Konstante abschaltbar.
- Ein Eintrag mit 0 Punkten gilt als **gestrichen** und erscheint durchgestrichen.
- Der Startspieler wird zufällig gewählt.

## Module (Balancing)

| Modul | Kosten | Klassik / Marathon | Meine Auslegung |
| --- | --- | --- | --- |
| Re-Roll-Chip | 35 | 2 / 6 | +1 Wurf in diesem Zug |
| Nudge | 30 | 2 / 6 | Ein Würfel ±1 |
| Freeze | 20 | 2 / 6 | Würfel bleibt den ganzen Zug gesperrt **und startet deinen nächsten Zug** mit diesem Wert (sonst wäre Freeze dasselbe wie Halten) |
| Joker | 60 | 1 / 3 | Ein Würfel bekommt eine beliebige Augenzahl („Kategorie mit einem anderen Würfelergebnis füllen“) |

- Jedes Modul ist nur einmal pro Zug nutzbar und erst nach dem ersten Wurf.
- Energie gibt es für starke Züge: 5 Gleiche +40, Große Straße +25, Bonus +30, Kleine Straße, Volles Haus und Vier Gleiche je +10, starke obere Felder +8, fertige Spalte im Marathon +15, ab Streak 3 je Zug +5. Maximal 100.
- Der Purist-Modus schaltet alle Module ab.

## Combo-Streak

Ein Eintrag gilt als „gut“, wenn er den Par-Wert der Kategorie erreicht (z. B. Dreier ≥ 9, Chance ≥ 24, jede Straße, jedes Volle Haus). Ab Streak 2 glüht der Bildschirmrand, ab 4 brennen die Würfel blau.

## Fortschritt

- XP: 40 je Spalte plus 0,25 je Punkt, Sieg-Bonus je Gegner, Erfolge und Tages-Challenge extra.
- Level-Kurve: 120 XP für Level 2, danach je Level 70 mehr.
- 10 Würfel-Skins (einer davon nur über 7 Tage Challenge-Streak), 5 Block-Themes, 5 Profil-Rahmen.
- 27 Erfolge, davon 9 versteckt.
- Alles bleibt lokal im Browser, es gibt keinen Login, keine Werbung und keine Tracker.

## Sonstiges

- Raumcode: 4 Zeichen ohne verwechselbare Zeichen (kein O/0, I/1/L).
- Sound und Musik werden komplett per Web Audio API erzeugt, es gibt keine fremden Audiodateien.
- Schriften: Orbitron und Rajdhani (SIL Open Font License), lokal gebündelt.
- Farbenblind-Modus: Ziffern auf den Würfeln, Symbole zusätzlich zu Farben im Block. Die Option „Weniger Bewegung“ schaltet Wackeln ab und kürzt die Würfel-Animation.

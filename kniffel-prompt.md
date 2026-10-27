# Prompt für Opus: NEON KNIFFEL (Arbeitstitel)

Du bist ein erstklassiger Fullstack- und Game-Entwickler mit Gespür für Game-Feel und Design. Baue mir ein **Online-Multiplayer-Kniffel-Spiel für Handys (mobile-first, Hochformat)**, das sich komplett von allen anderen Kniffel-Spielen abhebt, extrem hochwertig aussieht und so viel Spaß macht, dass man "noch eine Runde" spielen will. Arbeitstitel: **NEON KNIFFEL**. Falls dir ein besserer, kurzer Name einfällt, nimm ihn.

Das Spiel soll später per Link auf mehreren Handys gespielt werden können, ohne dass sich jemand registrieren muss.

---

## 1. Spielmodi (beim Erstellen der Lobby wählbar)

- **1 Spalte (Klassik):** ein Block mit 1 Spalte, 13 Runden pro Spieler.
- **7 Spalten (Marathon):** ein Block mit 7 Spalten, jede Spalte hat alle 13 Kategorien, also 91 Runden pro Spieler. Der Spieler darf in **jeder Runde frei wählen, in welche Spalte und Kategorie** er einträgt (so wie auf einem echten Spielblock mit 7 Spalten). Die Endsumme ist die Summe aller 7 Spaltensummen.

Multiplayer: **1 bis 4 Spieler** (Solo-Training mit Highscore ist auch erlaubt). Spieler treten über **Einladungslink oder 4-stelligen Raumcode** bei. Der Host startet das Spiel, wenn alle bereit sind. Reihum wird gespielt, alle sehen live, was der aktive Spieler macht (Würfel rollen, Halten, Eintragen).

---

## 2. Regeln (Spielblock wie in meinem Beispiel-Foto)

Pro Spalte gibt es diese Kategorien, in dieser Reihenfolge:

**Oberer Teil**
- Einer, Zweier, Dreier, Vierer, Fünfer, Sechser: Summe der Würfel mit dieser Augenzahl
- **Zwischensumme**
- **Bonus: +35**, wenn die Zwischensumme **mindestens 63** beträgt
- **Gesamtsumme 1. Teil** (Zwischensumme + Bonus)

**Unterer Teil**
- 1 Paar
- 2 Paar
- Drei Gleiche
- Vier Gleiche
- Volles Haus: **25 Punkte** fix
- Kleine Straße (4 aufeinanderfolgende Zahlen): **30 Punkte** fix
- Große Straße (5 aufeinanderfolgende Zahlen): **40 Punkte** fix
- 5 x gleiche Augenzahl (Kniffel): **50 Punkte** fix
- Chance: Summe aller Würfel
- **Gesamtsumme 2. Teil**

**Endsumme der Spalte** = Gesamtsumme 1. Teil + Gesamtsumme 2. Teil.

Punkte-Regeln für 1 Paar, 2 Paar, Drei Gleiche, Vier Gleiche: Wie auf dem Foto zählt hier **die Summe aller 5 Würfel**, sofern die Kombination vorhanden ist. (Auf dem Beispielblock stehen dort Werte wie 26 oder 29, das geht nur mit allen Würfeln.) Mach diese Zählweise als Konstante im Code leicht änderbar.

Ablauf einer Runde: 5 Würfel, **bis zu 3 Würfe**, nach jedem Wurf dürfen beliebige Würfel zum Behalten festgehalten werden. Danach **muss** der Spieler genau ein freies Feld wählen. Passt nichts, kann er ein Feld **streichen (0 Punkte)**, das auf dem Block als durchgestrichenes Feld erscheint.

Spielende: wenn alle Felder aller Spieler ausgefüllt sind. Danach Siegerehrung, Rangliste und Rematch-Button.

Wichtig: **Würfelergebnisse werden auf dem Server gewürfelt** (fair, nicht manipulierbar). Der Client zeigt nur die Animation. Die komplette Spiellogik (Punkteberechnung, Zugreihenfolge, Gültigkeit der Züge) liegt ebenfalls serverseitig.

---

## 3. Optik: Hightech / Cyberpunk

- Dunkles Interface, Neonfarben (Cyan, Magenta, Violett, Limette als Akzente), Glow-Effekte, feine Linien, Glasflächen, dezente Partikel im Hintergrund, Scanline- und Hologramm-Looks. Hochauflösend und scharf auf Retina-Displays.
- **Echte 3D-Würfel** mit Physik-Look (Three.js oder CSS-3D, was am besten läuft), die über den Bildschirm rollen, aneinanderstoßen und realistisch liegen bleiben. Würfel leuchten, sehen aus wie futuristische Hologramm- oder Kristallwürfel. Gehaltene Würfel bekommen einen klaren Lock-Effekt.
- Der **Spielblock** ist der Star: Er sieht aus wie ein futuristisches Daten-Terminal. Bei 7 Spalten muss er auf dem Handy trotzdem sehr gut bedienbar sein (z. B. Spalten wischbar oder per Tabs, aktive Spalte hervorgehoben, Übersicht über alle 7 Spalten auf einen Blick, Zoom-Ansicht beim Eintragen).
- **Live-Vorschau:** Mit den aktuellen Würfeln leuchten alle möglichen Felder auf und zeigen direkt, wie viele Punkte sie bringen würden. Das beste Feld wird dezent hervorgehoben. Eintragen per Tippen mit kurzer Bestätigung, damit man sich nicht vertippt.
- Flüssige Animationen (60 fps), Übergänge zwischen Spielern, deutliche "Du bist dran"-Anzeige.
- Alles in **deutscher Sprache**.

---

## 4. Extras, die es sonst nirgends gibt ("Suchtfaktor" ohne Echtgeld)

Bitte setze diese Ideen um und ergänze, was dir noch Gutes einfällt:

1. **Energie-Kern & Module:** Gute Züge (z. B. Treffer ab Großer Straße, Kniffel, Bonus erreicht, volle Spalte) laden einen Energie-Kern auf. Mit Energie kann man pro Spiel begrenzt **Module** zünden, zum Beispiel:
   - *Re-Roll-Chip:* ein zusätzlicher Wurf in dieser Runde
   - *Nudge:* einen Würfel um +1 oder −1 verschieben
   - *Freeze:* einen Würfel dauerhaft für die ganze Runde sperren, auch wenn man neu würfelt
   - *Joker-Feld:* eine Kategorie einmalig mit einem anderen Würfelergebnis füllen lassen
   Die Module müssen balanciert sein, damit Glück und Können zusammenspielen, und sie müssen in der Lobby **abschaltbar** sein (Purist-Modus ohne Module).
2. **Combo-Streaks:** Mehrere gute Züge hintereinander bauen einen Streak auf, der sich in Optik und Sound steigert (Bildschirmrand glüht, Würfel brennen blau).
3. **Kniffel-Cinematic:** Bei einem Kniffel gibt es eine kurze, spektakuläre Animation (Bildschirm-Shake, Lichtblitz, Partikelregen, Sound, Vibration). Ein echtes Highlight-Gefühl.
4. **Beinahe-Momente:** Wenn man knapp an etwas Großem vorbeigeschrammt ist (z. B. 4 gleiche, aber kein 5.), gibt es ein kleines Feedback und Lust auf den nächsten Versuch.
5. **Schütteln zum Würfeln:** Handy schütteln (DeviceMotion) löst den Wurf aus, zusätzlich Button und Wischgeste. Mit Haptik (Vibration), wo es unterstützt wird.
6. **Sound:** Eigene synthetische Sounds per Web Audio API (keine fremden Audiodateien, keine Urheberrechtsprobleme): Würfelrollen, Einrasten, Neon-Surren, Combo-Töne, Sieger-Fanfare. Dazu ein dezenter, loopender Synthwave-Hintergrund, alles einzeln abschaltbar.
7. **XP, Level & Freischaltungen:** Pro Spiel gibt es XP. Mit Level-Aufstiegen schaltet man **Würfel-Skins** (Neon, Hologramm, Glitch, Lava, Eis ...), **Block-Themes** und **Profil-Rahmen** frei. Alles lokal im Browser gespeichert, kein Login nötig.
8. **Tägliche Challenge:** Jeden Tag eine neue Aufgabe ("Erreiche 2 Mal eine Große Straße in 13 Runden"), deren Belohnung XP oder ein Skin ist. Plus ein Tages-Streak.
9. **Erfolge / Achievements:** Mindestens 20, teils versteckt (z. B. "Kniffel im ersten Wurf", "Bonus in allen 7 Spalten").
10. **Statistiken & Bestwerte:** Persönliche Rekorde, Kniffel-Zähler, Lieblings-Kategorie, Verlauf der letzten Spiele.
11. **Emotes & Reaktionen:** Schnelle Neon-Emotes, die man Mitspielern schicken kann (stumm schaltbar).
12. **Bots:** Leere Plätze können mit Bots in 3 Stärken aufgefüllt werden, damit man auch allein oder zu zweit spielen kann.
13. **Live-Rangliste während des Spiels** mit Punkteabstand und "Das brauchst du noch, um zu überholen".
14. **Optionaler Zugtimer** (z. B. 45 Sekunden), damit es mit 4 Leuten flott bleibt.

---

## 5. Technik

- **Mobile-first Web-App**, läuft im Handy-Browser, kein App-Store nötig. Auch am Desktop nutzbar.
- Stack-Vorschlag: **Node.js + Express + WebSocket (ws oder Socket.IO)** für Lobbys und Echtzeit, Frontend mit Vanilla JS/TypeScript oder einem schlanken Framework, **Three.js** für die 3D-Würfel. Du darfst einen besseren Stack wählen, wenn du ihn begründest. Es soll **einfach zu starten** (`npm install` und `npm start`) und **einfach zu hosten** sein (z. B. Render, Railway oder Fly.io), damit ich einen Link an Freunde schicken kann.
- **Reconnect:** Wenn jemand kurz das WLAN verliert oder die App wechselt, kommt er zurück ins laufende Spiel (Sitzung per Token in localStorage).
- Saubere Projektstruktur: Server-Logik (Regeln, Punkte, Lobbys) von Darstellung getrennt. **Die Punkteberechnung bekommt Unit-Tests** (alle Kategorien, Randfälle wie Kniffel als Volles Haus, Streichen, Bonus-Grenze 63).
- Keine Echtgeld-Mechanik, keine Werbung, keine Tracker.
- Barrierefreiheit: gute Kontraste, große Touch-Flächen, Farbenblind-Modus für die Würfel und Hinweise.

---

## 6. Vorgehen

1. Lies dieses Briefing komplett und fasse in 5 Sätzen zusammen, was du baust. Triff bei offenen Punkten selbst vernünftige Entscheidungen und halte sie kurz in einer `ENTSCHEIDUNGEN.md` fest, statt mich viel zu fragen.
2. Baue zuerst den **spielbaren Kern** (Regeln, Lobby, Online-Spiel mit 2 Spielern, beide Modi), dann Design und 3D-Würfel, dann die Extras.
3. Teste die Logik mit den Unit-Tests und spiele einmal einen kompletten Durchlauf mit Bots durch.
4. Liefere am Ende: lauffähiges Projekt, `README.md` mit Start- und Deploy-Anleitung (Schritt für Schritt, ich bin kein Profi), und eine kurze Liste, welche Extras fertig sind und welche noch offen.

Das Ergebnis soll sich anfühlen wie ein fertiges, hochwertiges Spiel, nicht wie ein Prototyp.

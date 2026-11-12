# BoardGameCollection

Verschiedene Spiele, die über GitHub Pages öffentlich spielbar sind. Die Startseite sieht aus wie ein kleines Betriebssystem:
links eine Taskleiste mit allen laufenden Anwendungen, Fenster mit Glas-Effekt, die man verschieben, in der Größe ändern,
minimieren und maximieren kann.

## Spiele

| Spiel | Beschreibung | Grafiken |
|---|---|---|
| **Domino** | Anlege-Domino gegen 1–3 Computergegner, Ziel 100 Punkte, 5 Steindesigns | Kenney *Domino Pack* |
| **Mahjong** | Solitaire („Schildkröte“, 144 Steine, immer lösbar) mit Zeitmessung oben, Rückgängig (Strg+Z), Tipp, Mischen, Pause | im Browser erzeugte SVGs |
| **Rommé** | 110 Karten (2 × 52 + 6 Joker), 1–3 NPCs einstellbar, Erstauslage 40 Punkte (abschaltbar), Anlegen, Punktetabelle | Kenney *Boardgame Pack* |
| **Entenjagd** | Schießbude, 2 Minuten Spielzeit, alle 30 Sekunden eine neue Stufe (schneller, kleiner, mehr Abtauchen), Magazin & Multiplikator | Kenney *Shooting Gallery* |
| **Rennen** | 3 Runden gegen einen NPC. Strecken: Oval, L-Kurs, Acht. Fahrzeuge: Sportwagen und Motorrad (5 Farben). Menü mit Top-10-Bestenliste je Strecke | Kenney *Racing Pack* |
| **Aquarium** | Startkapital 100 Einheiten; Schere-Stein-Papier-Prinzip: Rot frisst Grün, Grün frisst Blau, Blau frisst Rot. Halte mindestens 3 Fische am Leben | Kenney *Fish Pack* |

## Anwendungen

| Anwendung | Beschreibung |
|---|---|
| **SketchPainter** | Stift, Pinsel, Radierer, Linie, Rechteck, Ellipse, Füllen, Pipette; Rückgängig/Wiederholen; Bild öffnen, aus der Zwischenablage einfügen (Strg+V), kopieren, als PNG speichern; 16-Farben-Palette und 24-Bit-Farbe (Farbwähler, Hex, R/G/B) |
| **Diktiergerät** | Aufnahme per Mikrofon, gespeichert im Browser (IndexedDB); Liste mit max. 10 sichtbaren Einträgen; Tempo 1x/1,25x/1,5x/2x/3x ohne Tonhöhenänderung; Stimmverzerrer Hoch (Helium), Tief (Monster), Roboter, Telefon/Funk; Download als WAV inklusive Tempo und Effekt |
| **LoopStudio** | Kleines Musikprogramm: Spuren (Drumset, Bassline, Melo, Strings, Soundeffekte) mit Drehreglern für Hall, Radio und Phaser; Loops im 1/16-Raster (1, 2 oder 4 Takte), Mini-Pianoroll über 2 Oktaven; Arrangement über bis zu 64 Takte; Mixer mit Lautstärke je Spur und Master; Play, Play in Loop, Pause, Stop; Setup als JSON herunterladen und in jedem Browser wieder laden |

Startmenü: **Spielesammlung** (alle Spiele), **Anwendungen** (SketchPainter, Diktiergerät, LoopStudio), **Über**.
Im Hochformat (Smartphone) liegt die Taskleiste unten und zeigt laufende Programme nur als Icon.

### Aquarium – Spielprinzip

- Fische kaufen und per Klick ins Becken setzen. Die Klickhöhe ist die Schwimmbahn, die Fische schwimmen nur hin und her.
- Jeder Fisch verliert ständig Energie. Fressen füllt sie auf. Wer 3 Fische gefressen hat, bekommt Nachwuchs.
- Goldfische sind billige Beute für alle. Kugelfische frisst niemand, sie leben nur von Futter.
- Jeder lebende Fisch bringt Einheiten ein. Futter kostet Einheiten. Mit der Zeit steigt der Energieverbrauch.
- Das Spiel endet, sobald weniger als 3 Fische leben. Gewertet wird die Überlebenszeit.

### Rennen – Steuerung

| Taste | Aktion |
|---|---|
| ↑ / W | Gas |
| ↓ / S | Bremsen, im Stand langsam rückwärts |
| ← / A | nach links lenken |
| → / D | nach rechts lenken |
| P / Esc | Pause |

## Lokal starten

Keine Build-Schritte nötig. Es reicht ein beliebiger statischer Webserver:

```bash
python3 -m http.server 8000
```

Danach `http://localhost:8000` öffnen. Ein Direktlink öffnet ein Spiel sofort, z. B. `index.html#mahjong`
(`domino`, `mahjong`, `romme`, `duck`, `aquarium`, `racing`, `sketch`, `dicta`, `loop`).

## GitHub Pages

Im Repository unter **Settings → Pages** als Quelle *Deploy from a branch* wählen, Branch `main` und Ordner `/ (root)`.
Die Datei `.nojekyll` sorgt dafür, dass alle Dateien unverändert ausgeliefert werden.

## Struktur

```
index.html, css/os.css, js/os.js   Desktop, Taskleiste, Fenstermanager
apps/                              Anwendungen (SketchPainter, Diktiergerät, LoopStudio) und Info-Fenster
games/common.css                   gemeinsames Aussehen der Spiele
games/<spiel>/                     je ein Spiel (index.html + JavaScript)
assets/                            Hintergrundbild und Kenney-Grafiken (CC0)
```

## Credits

Grafiken und Icons: [Kenney](https://www.kenney.nl), Lizenz CC0 (siehe `assets/LICENSE-kenney.txt` und `assets/icons/LICENSE-kenney.txt`).

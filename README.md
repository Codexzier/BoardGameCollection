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
(`domino`, `mahjong`, `romme`, `duck`, `aquarium`, `racing`).

## GitHub Pages

Im Repository unter **Settings → Pages** als Quelle *Deploy from a branch* wählen, Branch `main` und Ordner `/ (root)`.
Die Datei `.nojekyll` sorgt dafür, dass alle Dateien unverändert ausgeliefert werden.

## Struktur

```
index.html, css/os.css, js/os.js   Desktop, Taskleiste, Fenstermanager
apps/about.html                    Info-Fenster
games/common.css                   gemeinsames Aussehen der Spiele
games/<spiel>/                     je ein Spiel (index.html + JavaScript)
assets/                            Hintergrundbild und Kenney-Grafiken (CC0)
```

## Credits

Grafiken: [Kenney](https://www.kenney.nl), Lizenz CC0 (siehe `assets/LICENSE-kenney.txt`).

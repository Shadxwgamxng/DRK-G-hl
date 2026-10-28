# Gestaltung nach DRK-Styleguide

Grundlage: offizieller DRK-Styleguide, https://styleguide.drk.de (Basiselemente Farben, Schrift, Logo, Grafikstil; Digital/Webseite).

## Logo (Wort-Bild-Marke)
- Datei: `public/brand/drk-goehl-logo.png` (vom Ortsverein bereitgestellt), unverändert verwendet.
- **Immer auf weißem Grund** („Das rote Kreuz steht immer auf weißem Grund“) – deshalb weiße Seitenleiste, weiße Kopfzeilen, kein invertiertes Logo.
- **Digitale Mindesthöhe 60 px** (Sidebar 62 px, mobil 60 px, Anmeldung 72 px), Schutzzone ≥ eine Balkenbreite des Kreuzes.
- PDF-Berichte: Logo rechts oben auf Weiß, ca. 12 mm hoch (Print-Minimum 10 mm).
- App-Icon/Favicon: rundes Abzeichen „Bereitschaft Göhl – Deutsches Rotes Kreuz“ auf Weiß (`public/brand/bereitschaft-goehl-logo.png`, Vorlage vom Ortsverein). In der App selbst bleibt die Wort-Bild-Marke des Ortsvereins. Eine hochauflösende Logodatei (SVG/PDF) sollte die 430×93-px-Vorlage ersetzen.

## Farben (Webseite)
| Rolle | Farbe | Tailwind |
|---|---|---|
| Überschriften, Hauptbuttons, Signal | DRK-Rot 230/0/5 `#e60005` | `drk-500` |
| Hover von Rot | Dunkelrot 165/30/15 `#a51e0f` | `drk-600` |
| Icons (Inhalt, leere Zustände) | Softrot 228/100/80 | `drk-400` |
| Menü, Menü-Icons, Sekundär-Buttons | Dunkelblau 0/45/85 `#002d55` | `drkblue-900` |
| Hover / Links | Mittelblau 0/140/205 | `drkblue-600` |
| Links im Fließtext | Volltonblau 34/117/208 | `drkblue-700` |
| Formular- und Infoflächen, Menü-Hover | Hellblau 235/245/255 | `drkblue-50` |
| Fließtext | Dunkelgrau 85/79/74 | `gray-700` |
| Trennlinien | Mittelgrau 180/180/180 | `gray-300` |
| Strukturierender Hintergrund | Hellgrau 239/238/234 | `gray-100` |

Grün/Gelb/Orange werden ausschließlich als **funktionale Statusfarben** (einsatzbereit, bald fällig, Mangel hoch) verwendet; sie sind keine Gestaltungsfarben.

## Schrift
Hausschrift Helvetica Neue (lizenzpflichtig; wird genutzt, wo auf dem Gerät vorhanden, z. B. Apple). Ersatz in Styleguide-Reihenfolge: **Open Sans** (lokal eingebunden, keine externen Server) → Arial → Helvetica. Überschriften in DRK-Rot, Fließtext Dunkelgrau, Auszeichnungen fett.

## Weitere Regeln
- Viel Weißraum, zurückhaltende, klar strukturierte Gestaltung, kaum Rundungen, keine Schatten.
- Tabellen werden mit Linien gegliedert (Kopf mit kräftiger Linie, feine Zeilenlinien), zurückgenommene Werte in Grau.
- PDF-Berichte: Titel DRK-Rot, Text Schwarz, Linien 0,25 pt, Nebeninformationen Grau 50 %.

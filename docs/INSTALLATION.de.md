# Installation

> Diese Anleitung gilt ab der ersten öffentlichen Version. Das Repository ist
> während der Entwicklung noch privat und kann deshalb noch nicht durch andere
> HACS-Nutzer installiert werden.

## Voraussetzungen

Installiere und richte zuerst diese HACS-Projekte ein:

1. Stellantis Vehicles
2. Bubble Card
3. Button Card
4. ha-map-card

Unter **Einstellungen → Geräte & Dienste → Stellantis Vehicles** muss bereits
ein Fahrzeug sichtbar sein.

## Installation

1. Öffne HACS und wähle **Benutzerdefinierte Repositories**.
2. Füge `CaneTLOTW/e_c3_dashboard` als Typ **Integration** hinzu.
3. Lade **e-C3 Dashboard** herunter.
4. Starte Home Assistant neu.
5. Öffne **Einstellungen → Geräte & Dienste → Integration hinzufügen**.
6. Wähle **e-C3 Dashboard**, dann Fahrzeug und eine eindeutige lokale
   Fahrzeugkennung.
7. Öffne **Einstellungen → Dashboards → Dashboard hinzufügen**.
8. Wähle unter **Community-Dashboards** das **e-C3 Dashboard**.

Fehlt eine verpflichtende Karte, zeigt das Dashboard eine Einrichtungsseite
mit der konkret fehlenden Karte. Installiere sie per HACS, starte Home
Assistant neu und lade die Browserseite neu.

## Historienmodule

Fahrten-, Lade- und GPS-Historie benötigen die Home-Assistant-Recorder-Historie.
Dieses Projekt verändert weder Aufbewahrungszeit noch Datenbank. InfluxDB ist
optional und bleibt eine getrennte Nutzerkonfiguration.

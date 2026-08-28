# e-C3 Fahrzeugübersicht für Home-Assistant-Startseiten

## Zweck

`custom:e-c3-dashboard-vehicle-overview-card` ist die portable Version der bereits produktiv genutzten Startseitenkarte. Das Layout wurde nicht neu gestaltet; die bestehende `Mobilität`-Karte wurde auf den Config-Entry-/Entity-Mapping-Vertrag von `e_c3_dashboard` portiert.

Seit 0.5.39 nutzt auch die automatisch erzeugte **LIVE-/Vehicle-Ansicht** dieselbe kanonische Fahrzeugübersicht mit `variant: live`. Dadurch existiert nicht mehr parallel ein zweiter Strategy-Hero-Bildpfad. Startseitenkarte und LIVE-Hero beziehen das Fahrzeugbild beide aus dem gemappten Live-Tracker.

![e-C3 Fahrzeugübersicht](assets/vehicle-overview-card.webp)

## Minimaler Einsatz

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

Bei genau einem konfigurierten e-C3-Fahrzeug reicht das aus. Die Karte erzeugt intern wieder:

- Heading `Mobilität`
- 270-px-Fahrzeug-Hero
- anklickbare Reichweite oben links
- anklickbares Ladeende/Ladestatus bzw. Temperatur oben rechts
- Vorklimatisierungsbutton
- Ladekabel-Indikator
- Fahrindikator
- transparente Navigation über der Fahrzeugfläche
- Batterie-Fortschrittsleiste mit Lade-/Fahrtstatus und Pulsanimation

Die beiden Status-Pills folgen dem bewährten Referenz-Dashboard: feste 26-px-Höhe, kompakte Icon/Text-Anordnung und natives Home-Assistant-`more-info`.

## Optionale Konfiguration

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
entry_id: <e_c3_dashboard config-entry id>
navigation_path: /optional/override/vehicle
heading: Mobilität
heading_icon: fa6-solid:car
```

`entry_id` ist nur bei mehreren e-C3 Config Entries erforderlich. `navigation_path` ist ausschließlich ein Override.

`variant: live` ist ein interner Package-Pfad für den vom Dashboard erzeugten LIVE-Hero und muss für eine normale Startseitenkarte nicht gesetzt werden.

## Mapping statt haushaltsspezifischer IDs

Die frühere Karte enthielt VIN-/Gerätepfade und feste Entity-IDs. Die Package-Karte verwendet ausschließlich den Statusvertrag der ausgewählten `e_c3_dashboard` Config Entry:

- `vehicle_tracker`
- `entity_mapping.battery`
- `entity_mapping.autonomy`
- `entity_mapping.temperature`
- `entity_mapping.battery_charging`
- `entity_mapping.battery_charging_end`
- `entity_mapping.battery_plugged`
- `entity_mapping.engine`
- `entity_mapping.preconditioning`
- `entity_mapping.preconditioning_start`
- `entity_mapping.preconditioning_stop`
- `metric_entities.current_charge_power`
- `metric_entities.current_trip_energy`

Das Fahrzeugbild kommt live aus `hass.states[vehicle_tracker].attributes.entity_picture`. Die Wrapper-Karte überwacht diese URL ausdrücklich und baut die innere Button-Card neu, wenn das Bild erst nach dem ersten Render verfügbar wird oder sich ändert.

## Gemeinsamer LIVE-Hero ab 0.5.39

Die generierte `/vehicle`-Ansicht verwendet keine separate Hero-Implementierung mehr. Stattdessen wird die gleiche `custom:e-c3-dashboard-vehicle-overview-card` mit `variant: live` eingebettet.

Damit teilen sich Startseitenkarte und LIVE-Ansicht insbesondere:

- Tracker-/Config-Entry-Auflösung,
- `entity_picture`-Lifecycle,
- Range-/Temperatur-/SOC-Darstellung,
- Lade-, Kabel- und Fahrzustände,
- Vorklimatisierungsaktionen.

Map-Marker und Fahrzeug-Hero bleiben technisch getrennte Pfade; der transparente Kartenmarker darf das LIVE-Bild nicht nachpatchen.

## Navigation und Bedienung

- Tap auf die mittlere Fahrzeugfläche: e-C3 Dashboard `/vehicle`
- Tap/Hold auf Reichweite: natives More Info der gemappten Autonomy-/Range-Entity
- Tap/Hold auf den rechten Status: natives More Info der tatsächlich angezeigten Entity; im Normalzustand Temperatur, beim Laden Ladeende bzw. Ladestatus
- Tap Vorklimatisierung: `button.press` auf gemapptes `preconditioning_start`
- Hold Vorklimatisierung: `button.press` auf gemapptes `preconditioning_stop`
- Tap Batteriezeile: More Info des gemappten Batteriesensors

Ist die Vorklimatisierung aktiv, wird ihr Button anhand der gemappten Fahrzeugtemperatur eingefärbt: bis einschließlich 20 °C rot als Heizindikator, über 20 °C blau als Kühlindikator. Bei inaktiver Vorklimatisierung bleibt der Button neutral/dunkel.

Im LIVE-Variant öffnet der Info-Button den gemeinsamen Dialog **Fahrzeug- und Wartungsdaten**. Wartungsdaten stehen dort zuerst, Fahrzeugdaten darunter. Eine zusätzliche, doppelte Fahrzeuginformationskarte im Vehicle-View gibt es nicht mehr.

Der Hero besitzt einen lokalen Stacking Context. Dadurch werden Reichweiten-/Temperatur-Pills, A/C-Button und Batteriezeile bei geöffnetem Bubble-Card-Popup vollständig vom Popup-Backdrop überlagert statt vor dem Dialog stehen zu bleiben.

## System statt Vehicle

Administratives gehört nicht in den LIVE-Fahrzeugbereich. Deshalb liegen folgende Controls im generierten **System**-View:

- Aktualisierungsintervall
- Korrektur Batteriewerte
- ABRP Live-Daten
- ABRP Token

Der Vehicle-View bleibt damit auf Fahrzeugzustand, Nutzung, Laden, Historie und Fahrzeug-/Wartungsinformationen fokussiert.

## Packaging

Die Karte ist ein internes ES-Modul des HACS-Integrationspakets. Sie bekommt **keinen eigenen Lovelace-Resource-Eintrag**. Der Package-Einstieg `frontend.js` lädt sie kontrolliert. Das gilt auch für die Nutzung als LIVE-Hero.

## Acceptance

Vor Promotion eines neuen Runtime-Candidates prüfen:

1. Karte erscheint im Card Picker als `e-C3 Fahrzeugübersicht`.
2. Minimal-YAML funktioniert.
3. Darstellung entspricht der bisherigen Startseitenkarte.
4. Fahrzeugbild erscheint ohne F5, auch wenn `entity_picture` verspätet kommt.
5. Reichweite/Temperatur/Ladestatus/Kabel/Fahrt/Batterie reagieren live.
6. Reichweite und rechter Status öffnen More Info der korrekten gemappten Entity.
7. Vorklimatisierung Tap/Hold funktioniert und die aktive Heiz-/Kühlfarbe folgt der 20-°C-Regel.
8. Navigation landet im package-owned e-C3 Dashboard `/vehicle`.
9. LIVE-/Vehicle-Ansicht verwendet dieselbe kanonische Overview-Card und keinen zweiten Hero-Bildpfad.
10. Fahrzeug-/Wartungspopup überlagert den kompletten Hero korrekt; Wartung steht vor Fahrzeugdaten.
11. Keine VIN/festen Fahrzeug-Entity-IDs oder Legacy-KFZ-Route im Quellcode.
12. Karte bleibt Bestandteil des einen eC3-Frontend-Pakets und führt keinen neuen Nachpatchpfad ein.

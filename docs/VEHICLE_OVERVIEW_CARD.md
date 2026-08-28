# e-C3 Fahrzeugübersicht für Home-Assistant-Startseiten

## Zweck

`custom:e-c3-dashboard-vehicle-overview-card` ist die portable Version der bereits produktiv genutzten Startseitenkarte. Das Layout wurde nicht neu gestaltet; die bestehende `Mobilität`-Karte wurde auf den Config-Entry-/Entity-Mapping-Vertrag von `e_c3_dashboard` portiert.

## Minimaler Einsatz

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
```

Bei genau einem konfigurierten e-C3-Fahrzeug reicht das aus. Die Karte erzeugt intern wieder:

- Heading `Mobilität`
- 270-px-Fahrzeug-Hero
- Reichweite oben links
- Ladeende/Ladestatus bzw. Temperatur oben rechts
- Vorklimatisierungsbutton
- Ladekabel-Indikator
- Fahrindikator
- transparente Navigation über der Fahrzeugfläche
- Batterie-Fortschrittsleiste mit Lade-/Fahrtstatus und Pulsanimation

## Optionale Konfiguration

```yaml
type: custom:e-c3-dashboard-vehicle-overview-card
entry_id: <e_c3_dashboard config-entry id>
navigation_path: /optional/override/vehicle
heading: Mobilität
heading_icon: fa6-solid:car
```

`entry_id` ist nur bei mehreren e-C3 Config Entries erforderlich. `navigation_path` ist ausschließlich ein Override.

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

Das Fahrzeugbild kommt live aus `hass.states[vehicle_tracker].attributes.entity_picture`. Die Wrapper-Karte überwacht diese URL ausdrücklich und baut die innere Button-Card neu, wenn das Bild erst nach dem ersten Render verfügbar wird.

## Navigation

Die alte Route `/dashboard-kfz/ec3` wird nicht verwendet. Standardmäßig wird aus `vehicle_slug` der vom Package erzeugte Dashboardpfad gebildet:

```text
/e-c3-<slug>/vehicle
```

## Bedienung

- Tap auf die mittlere Fahrzeugfläche: e-C3 Dashboard `/vehicle`
- Tap Vorklimatisierung: `button.press` auf gemapptes `preconditioning_start`
- Hold Vorklimatisierung: `button.press` auf gemapptes `preconditioning_stop`
- Tap Batteriezeile: More Info des gemappten Batteriesensors

## Packaging

Die Karte ist ein internes ES-Modul des HACS-Integrationspakets. Sie bekommt **keinen eigenen Lovelace-Resource-Eintrag**. Der Package-Einstieg `frontend.js` lädt sie kontrolliert.

## Acceptance

Vor Promotion nach `main` prüfen:

1. Karte erscheint im Card Picker als `e-C3 Fahrzeugübersicht`.
2. Minimal-YAML funktioniert.
3. Darstellung entspricht der bisherigen Startseitenkarte.
4. Fahrzeugbild erscheint ohne F5, auch wenn `entity_picture` verspätet kommt.
5. Reichweite/Temperatur/Ladestatus/Kabel/Fahrt/Batterie reagieren live.
6. Vorklimatisierung Tap/Hold funktioniert.
7. Navigation landet im package-owned e-C3 Dashboard `/vehicle`.
8. Keine VIN/festen Fahrzeug-Entity-IDs oder Legacy-KFZ-Route im Quellcode.
9. Karte bleibt Bestandteil des einen eC3-Frontend-Pakets und führt keinen neuen Nachpatchpfad ein.

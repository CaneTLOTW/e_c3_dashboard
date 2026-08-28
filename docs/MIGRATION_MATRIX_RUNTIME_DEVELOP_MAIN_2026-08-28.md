# e-C3 Dashboard – Migrationsmatrix Runtime / develop / main

Stand: 2026-08-28
Status: Branchbasis bereinigt / fachliche Migration weiterhin schrittweise

Diese Matrix dokumentiert den Vergleich zwischen der produktiven
Home-Assistant-Runtime, `develop`, `main` sowie der Legacy-Komponente
`stellantis_drive_metrics`.

## Update 2026-08-28 – Branch-Historie bereinigt

Der frühere Git-Querstand ist behoben.

Vor dem Cleanup waren `main` und `develop` seit
`2797c2eee414eb72c8fab3301f963f45422c1ad9` unabhängig weitergelaufen. Dabei
waren mehrere fachlich identische Fixes mit unterschiedlichen Commit-SHAs auf
beiden Branches gelandet. Beispiele:

- `Clear stale charge power after charging ends`
- `Finalize stale active charge after restart`

Zusätzlich war der reaktive LIVE-Fahrzeugbild-Fix zeitweise nur auf `main`
vorhanden.

Bereinigung:

- der LIVE-Fahrzeugbild-Fix wurde gezielt auf den aktuellen `develop`-Stand
  portiert;
- `develop` behält seinen aktuellen Funktionsstand;
- die Historie wurde mit `main` als zusätzlichem Parent zusammengeführt, ohne
  den `develop`-Tree auf ältere Dateien zurückzusetzen;
- GitHub meldet anschließend `main...develop = ahead`, nicht mehr `diverged`;
- `main` blieb unverändert und ist wieder Vorfahr von `develop`.

Historien-Reconcile:

`6262612e43312e455a65afeb9c6a41b01004dd28`

Deployment-Vertrag:

`docs/BRANCH_AND_DEPLOYMENT_WORKFLOW.md`

Maintenance Issue:

`#15 [MAINT] develop/main-Historie bereinigen und Deployment-Vertrag festschreiben`

Damit ist die **Branchbasis entschieden**. Die übrigen fachlichen eC3-Themen
werden trotzdem weiterhin einzeln bewertet und nicht als pauschale
Funktionsmigration freigegeben.

## Aktuelle Branchrollen

```text
develop = Integration + reale HA-Abnahme / Canary
main    = letzter akzeptierter/publizierbarer Stable-Stand
```

Neue Arbeit entsteht ausschließlich auf `develop`. Codex deployt den exakten
`develop`-SHA. Nach Runtime-PASS und Maintainer-Abnahme wird genau dieser SHA
per Fast-Forward nach `main` promotet und von dort released.

## Versionsstände

| Stand | Integration | Frontend | Rolle |
| --- | ---: | ---: | --- |
| produktive Heimdall-Runtime beim ursprünglichen Audit | 0.5.31 | 0.5.31 | damaliger Live-Stand |
| aktueller `develop` Kandidat | 0.5.32 | 0.5.32 | Abnahme/Canary |
| `main` | 0.5.28 | 0.5.28 | letzter Stable-Branchstand |

Die Versionsnummern der historischen Runtime waren zeitweise weiter als die
Repository-Metadaten von `develop`; der neue Kandidat ist deshalb bewusst auf
0.5.32 ausgerichtet.

## Funktionsmatrix

| Funktion / Bereich | Runtime-Audit | aktuelles `develop` | `main` Stable | Bewertung / nächster Schritt |
| --- | --- | --- | --- | --- |
| Config Flow / Fahrzeugzuordnung | gleich | aktuell | älter/kompatibel | kein Konflikt bekannt |
| Automatisch erzeugtes e-C3-Dashboard | gleich | aktuell | älter/kompatibel | Basis beibehalten |
| Entity-/Device-Registry-Mapping | gleich | aktuell | älter/kompatibel | keine kosmetische ID-Migration |
| `entity_mapping` / `control_entities` / `metric_entities` | vorhanden | vorhanden | vorhanden | zentrale portable Mapping-Schicht |
| Server-Fahrtenhistorie | vorhanden | vorhanden | vorhanden | beibehalten |
| Server-Ladehistorie | vorhanden | vorhanden | vorhanden | beibehalten |
| GPS-Historie / Server-Trip-Positionen | vorhanden | vorhanden | vorhanden | beibehalten |
| restart-sichere lokale Fahr-/Lademetriken | vorhanden | vorhanden | vorhanden | beibehalten |
| Trip-History Card | vorhanden | aktuell | älter | kein eigenständiger Merge nötig |
| Charge-History Card | develop-nah | aktueller Sollkandidat | älter/abweichend | `develop` weiter runtime-validieren |
| Charge-Curve Standardauswahl | neuester Ladevorgang | neuester Ladevorgang | historisch abweichend | `develop`-Verhalten beibehalten |
| Langzeitstatistik Aggregation | Woche | Woche | Monat | aktuelle Produktentscheidung später separat bestätigen |
| Statistik-Legende | ausgeblendet | ausgeblendet | sichtbar | aktuelle Produktentscheidung später separat bestätigen |
| LIVE Hero bei spätem `entity_picture` | intermittierend leer | **reaktiver Fix implementiert** | reaktiver Fix historisch vorhanden | Issue #5 jetzt Runtime-validieren |
| transparenter Map-Marker Dark Mode | vorhanden | vorhanden | vorhanden | muss beim #5-Test regressionsfrei bleiben |
| Vehicle-Info-Popup | vorhanden | vorhanden | vorhanden | beibehalten |
| auswählbare Vehicle-Overview-Card | nicht vorhanden | nicht vorhanden | nicht vorhanden | separates späteres Feature |

## LIVE-Fahrzeugbild – aktueller Stand

Der relevante `main`-Vorsprung wurde gezielt übernommen, ohne einen alten
Branchstand über `develop` zu legen.

`develop` enthält jetzt:

- tracker-gebundenes Hero-Bild;
- `triggers_update` auf den realen `vehicle_tracker`;
- echtes `<img>` statt statisch eingefrorenem Background;
- Nachziehen eines verspäteten `entity_picture`;
- synchrone Installation des Strategy-Patches bereits bei
  `customElements.define`, damit auch der erste Lovelace-Render erfasst wird;
- separaten, weiterhin opt-in Map-Marker-Transparency-Fix.

Relevante Commits:

- `0e44a41a059457ae6bd8618b4f66a39328aedbb1`
- `0f7a098847e0110793bdadbc971451ac5ea6cf7b`
- `f313c47b24bfb8211878b4679c15f7057af28f4c`

Issue #5 bleibt offen, bis der exakte `develop`-Kandidat in Browser und HA-App
Light/Dark erfolgreich abgenommen wurde.

## Was der Historien-Reconcile bewusst nicht bedeutet

Die Zusammenführung der Git-Historie ist **keine** automatische Freigabe aller
eC3-Backlogpunkte.

Insbesondere weiterhin nicht automatisch:

- `stellantis_drive_metrics` entfernen;
- Entity-/Unique-IDs migrieren;
- Stores/Baselines migrieren;
- Statistik-UX endgültig ändern;
- Vehicle-Overview-Card bauen;
- Issues #8–#14 pauschal umsetzen.

## Legacy: `stellantis_drive_metrics`

Die Legacy-Komponente ist weiterhin nicht migrationssicher entfernbar.

| Funktion | `stellantis_drive_metrics` | e-C3 Dashboard |
| --- | --- | --- |
| Durchschnittsverbrauch letzte 500 km | eigene persistierte Fahrtliste | `VehicleMetricsManager` + kanonische Fahrten |
| Strecke seit letztem Ladevorgang | Legacy-Charge-Baseline + Recorder-Recovery | eC3-Baseline + Recorder-/Server-Reconciliation |
| Entity-/Unique-ID | feste Legacy-IDs | Config-Entry-basierte IDs |
| Persistenz | eigener HA Store | eC3 Store / Server-History |

Die Mathematik ist ähnlich, die zugrunde liegenden Fahrten und Baselines sind
aber nicht zwangsläufig identisch.

### Paritätsgate vor Entfernung

- [ ] alle Legacy-Funktionen einem eC3-Ziel zugeordnet
- [ ] Live-Werte über repräsentativen Zeitraum verglichen
- [ ] Unterschiede fachlich erklärt
- [ ] Entity-/Unique-ID-Migration geklärt
- [ ] Recorder-Historie / Dashboards / Automationen geprüft
- [ ] Charge-Baseline migrationssicher
- [ ] alle Legacy-Konsumenten gefunden

## Nächste eC3-Reihenfolge

1. Issue #5 gegen den exakten `develop`-SHA runtime-validieren.
2. Bei PASS den Kandidaten reviewen; noch kein automatischer Stable-Release ohne
   Maintainer-Abnahme.
3. Später die offenen Produktentscheidungen aus Issue #7 einzeln behandeln.
4. Legacy erst nach bestandenem Paritätsgate entfernen.
5. Neue Features wie Vehicle-Overview erst auf dieser sauberen Branchbasis
   entwickeln.

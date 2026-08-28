# e-C3 Dashboard – Migrationsmatrix Runtime / develop / main

Stand: 2026-08-28
Status: Analyse / keine Umsetzung

Diese Matrix dokumentiert den bereits durchgeführten Vergleich zwischen der produktiven
Home-Assistant-Runtime, dem Branch `develop`, dem Branch `main` des Repositories
`CaneTLOTW/e_c3_dashboard` sowie der Legacy-Komponente `stellantis_drive_metrics`.

Ziel ist, die spätere Konsolidierung **featureweise** durchzuführen und nicht erneut bei null
anzufangen oder Branches blind zusammenzuführen.

## Kernbefund

Die produktive Heimdall-Runtime ist backendseitig weitgehend identisch mit `develop`.
Die wichtigste Divergenz liegt aktuell zwischen `develop` und `main`.

Die Branches sollen daher nicht pauschal gemerged werden. Stattdessen ist pro Funktion zu
entscheiden, welche Variante fachlich der Sollstand ist.

## Versionsstände beim Audit

| Stand | Integration | Frontend |
| --- | ---: | ---: |
| Produktive Heimdall-Runtime | 0.5.31 | 0.5.31 |
| `develop` | 0.5.26 | 0.5.29 |
| `main` | 0.5.28 | 0.5.28 |

Die Versionsnummer allein beschreibt nicht die funktionale Reihenfolge der Branches.

## Funktionsmatrix

| Funktion / Bereich | Runtime | `develop` | `main` | Bewertung / Migrationshinweis |
| --- | --- | --- | --- | --- |
| Config Flow / Fahrzeugzuordnung | gleich | gleich | gleich | kein Konflikt bekannt |
| Automatisch erzeugtes e-C3-Dashboard | gleich | gleich | gleich | Basis beibehalten |
| Entity-/Device-Registry-Mapping | gleich | gleich | gleich | keine kosmetische ID-Migration |
| Status-Entity mit `entity_mapping` / `control_entities` / `metric_entities` | gleich | gleich | gleich | zentrale portable Mapping-Schicht |
| Server-Fahrtenhistorie | gleich | gleich | gleich | beibehalten |
| Server-Ladehistorie | gleich | gleich | gleich | beibehalten |
| GPS-Historie / Server-Trip-Positionen | gleich | gleich | gleich | beibehalten |
| restart-sichere lokale Fahr-/Lademetriken | gleich | gleich | gleich | beibehalten |
| Trip-History Card | gleich | gleich | gleich | kein Konflikt bekannt |
| Charge-History Card | develop-nah | develop-Stand | ältere/abweichende Variante | Verhalten einzeln vergleichen |
| Charge-Curve Card | develop-nah | develop-Stand | ältere/abweichende Variante | develop-Verhalten derzeit produktiv |
| Charge-Curve Auswahl ohne explizite Übergabe | neuester Ladevorgang | neuester Ladevorgang | alter `sessionStorage` kann ältere Auswahl festhalten | develop-Verhalten als wahrscheinlicher Sollstand |
| Charge-History → Charge-Curve Übergabe | URL-/Session-Handoff vorhanden | vorhanden | vorhanden, aber Auswahlverhalten abweichend | beim Merge Regressionstest erforderlich |
| Langzeitstatistik Aggregation | Woche | Woche | Monat | fachlich entscheiden; produktiv derzeit Woche |
| Statistik-Legende | ausgeblendet | ausgeblendet | sichtbar | produktiv derzeit ausgeblendet |
| LIVE Hero Fahrzeugbild bei spätem `entity_picture` | instabil / intermittierend leer | instabil / intermittierend leer | reaktiver Patch vorhanden | **Must-keep aus `main` oder sauber neu implementieren**; siehe Issue #5 |
| transparenter Fahrzeugmarker auf Positionskarte im Dark Mode | vorhanden | vorhanden | vorhanden | behalten; vom Hero-Bildfix entkoppeln |
| reaktive LIVE-Bildlogik und Marker-Fix getrennt | nein | nein | ja | `main` ist hier architektonisch weiter |
| Vehicle-Info-Popup | vorhanden | vorhanden | vorhanden | beibehalten |
| View `vehicle` / Live | vorhanden | vorhanden | vorhanden | beibehalten |
| View `trips` | im Code vorhanden | im Code vorhanden | im Code vorhanden | Nutzung/UX später separat bewerten |
| View `charging` | vorhanden | vorhanden | vorhanden | beibehalten |
| View `statistics` | vorhanden | vorhanden | vorhanden | Aggregation/Legende entscheiden |
| auswählbare Vehicle-Overview-Card für andere Dashboards | **nicht vorhanden** | **nicht vorhanden** | **nicht vorhanden** | separates späteres Feature, noch nicht implementieren |
| automatische Navigation einer externen Overview-Card auf das eigene eC3-Dashboard | nicht vorhanden | nicht vorhanden | nicht vorhanden | separates Feature |

## Runtime vs. `develop`

Beim Audit waren die wesentlichen Backend- und Frontenddateien zwischen produktiver Runtime
und `develop` inhaltlich weitgehend identisch. Dazu gehörten insbesondere:

- `__init__.py`
- Config Flow
- Coordinator
- Dashboard-Erzeugung
- `metrics.py`
- `sensor.py`
- `server_history.py`
- Notifications
- Buttons / Switches
- zentrale Dashboard-JS-Datei
- Trip-History Card
- Charge-History / Charge-Curve
- Übersetzungen

Die produktive Runtime enthält gegenüber dem damaligen `develop` vor allem:

- Versionsstand 0.5.31,
- einen leicht überarbeiteten `map-marker-fix.js`.

Daraus folgt:

> Die spätere Migration ist **kein vollständiges Runtime→develop-Recovery-Projekt**.
> Der Großteil der portablen Runtime-Funktionalität ist bereits in `develop` vorhanden.

## Wichtigste Divergenz `develop` vs. `main`

### Aus `develop` / produktiver Runtime unbedingt berücksichtigen

1. **Charge-Curve Standardauswahl**
   - ohne explizite URL-Auswahl soll der neueste Ladevorgang angezeigt werden;
   - ein alter `sessionStorage`-Wert soll nicht dauerhaft auf eine alte Kurve pinnen.

2. **Langzeitstatistik**
   - aktuell Wochenaggregation statt Monatsaggregation;
   - Legende aktuell ausgeblendet.

Diese Punkte sind produktiv erprobt und dürfen bei einer Konsolidierung nicht unbemerkt auf
älteres Verhalten zurückfallen.

### Aus `main` unbedingt berücksichtigen

#### Reaktives LIVE-Fahrzeugbild

`main` enthält zusätzlich zum eigentlichen Map-Marker-Fix eine Nachbearbeitung des Live-Heros:

- `vehicle_tracker` wird in `triggers_update` eingebunden,
- statisches Background-Styling wird entfernt,
- das Fahrzeugbild wird über ein tracker-gebundenes `<img>` gerendert,
- `entity_picture` wird bei jedem Render erneut gelesen,
- verspätet eintreffendes `entity_picture` kann dadurch automatisch nachgezogen werden.

Dieser Fix adressiert das aktuelle produktive Problem, dass der Live-Hero beim Öffnen oft leer
bleibt und erst nach F5 wieder ein Fahrzeugbild zeigt.

Referenz: Issue #5.

## Legacy: `stellantis_drive_metrics`

Die Legacy-Komponente ist derzeit **noch nicht migrationssicher entfernbar**.

Sie liefert im Wesentlichen zwei eigene Kennwerte:

| Funktion | `stellantis_drive_metrics` | e-C3 Dashboard |
| --- | --- | --- |
| Durchschnittsverbrauch letzte 500 km | eigene persistierte Fahrtliste aus lokalen Abschluss-Events | eigener `VehicleMetricsManager`, lokale/Server-Historie und kanonische Fahrten |
| Strecke seit letztem Ladevorgang | Legacy-Charge-Baseline + Recorder-Recovery | eC3-eigene Ladebaseline + Recorder-/Server-Reconciliation |
| Entity-/Unique-ID | feste Legacy-IDs | Config-Entry-basierte eC3-IDs |
| Persistenz | eigener HA Store | eigener eC3 HA Store / Server-History-Kanonisierung |

Die Mathematik des 500-km-Fensters ist ähnlich, aber die zugrunde liegenden Fahrten und
Baselines entstehen nicht identisch. Beim Audit wurden deshalb auch unterschiedliche Live-Werte
beobachtet.

### Paritätsgate vor Entfernung

`stellantis_drive_metrics` erst entfernen, wenn:

- [ ] alle Legacy-Funktionen einem eC3-Ziel eindeutig zugeordnet sind,
- [ ] Live-Werte über einen repräsentativen Zeitraum verglichen wurden,
- [ ] Unterschiede fachlich erklärt sind,
- [ ] Entity-/Unique-ID-Migration geklärt ist,
- [ ] Recorder-Historie / Dashboards / Automationen nicht verloren gehen,
- [ ] Charge-Baseline sicher übernommen oder bewusst neu gesetzt wird,
- [ ] alle Konsumenten der Legacy-Entities gefunden wurden.

## Empfohlene spätere Entscheidungsreihenfolge

Die Migration sollte **nicht** als ein großer Merge erfolgen, sondern Punkt für Punkt:

1. Branchbasis und Zielstrategie festlegen.
2. LIVE-Hero-Bildfix aus Issue #5 lösen und testen.
3. Charge-Curve-Auswahl als Sollverhalten festlegen.
4. Langzeitstatistik: Woche vs. Monat + Legendenentscheidung.
5. Views/UX (`trips`, `charging`, `statistics`) einzeln bestätigen.
6. Runtime-/develop/main-Dateiunterschiede erneut nach jedem Schritt reduzieren.
7. Legacy-`stellantis_drive_metrics` erst anschließend mit Paritätsgate migrieren.
8. Erst auf konsolidierter Basis neue Features wie die Vehicle-Overview-Card entwickeln.

## Nicht Ziel dieser Matrix

Diese Datei ist **keine Implementierungsfreigabe**.

Insbesondere jetzt noch nicht:

- Branches blind mergen,
- `stellantis_drive_metrics` löschen,
- Entity-/Unique-IDs ändern,
- Stores/Baselines migrieren,
- neue Vehicle-Overview-Card implementieren.

Die Matrix dient als dauerhafte Entscheidungsgrundlage für die schrittweise Konsolidierung.

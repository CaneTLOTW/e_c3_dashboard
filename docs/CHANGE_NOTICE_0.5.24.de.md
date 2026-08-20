# Änderungshinweis e-C3 Dashboard 0.5.24

Stand: 21.08.2026

## Kurzfassung

Der schwarze quadratische Hintergrund hinter dem Fahrzeugbild in der
Kartenansicht ist behoben. Die Ursache lag nicht im PNG, sondern im Dark-Mode-
Fallback von `ha-map-card` innerhalb des Shadow DOM.

Die Korrektur liegt jetzt vollständig im Repository `e_c3_dashboard` und
ändert die HACS-Komponente `ha-map-card` nicht.

## Sichtbares Verhalten

Im Dark Mode gilt jetzt:

- Das Fahrzeugbild in der LIVE-Karte bleibt unverändert.
- Der Fahrzeugmarker in der Positions-/GPS-Karte behält die Transparenz des
  PNGs.
- Der schwarze quadratische Marker-Hintergrund wird entfernt.
- Andere `ha-map-card`-Marker in Home Assistant bleiben unverändert.

Zusätzlich sind die History-Umbauten Bestandteil dieses Stands:

### Fahrthistorie

- Abgeschlossene Fahrten stammen aus der Stellantis-Serverhistorie.
- Server-IDs verhindern doppelte Fahrten bei wiederholten Synchronisationen.
- 0-km-Serverereignisse bleiben intern erhalten, werden aber standardmäßig
  nicht als normale Fahrt angezeigt.
- Die kompakte History im View **Fahrzeug** nutzt standardmäßig 30 Tage,
  blendet Kurzstrecken bis 1 km aus und blendet 0-km-Ereignisse aus.
- Im vollständigen View **Fahrten** stehen die erweiterten Filter zur Verfügung.
- Ältere Datensätze werden beim Scrollen schrittweise nachgeladen.
- Eine Zeile kann aufgeklappt werden und zeigt Start-/End-Kilometerstand sowie
  Start-/End-SOC.
- Über **Serverhistorie aktualisieren** kann die Serverhistorie manuell neu
  synchronisiert werden.
- Bei unverändertem oder nicht belastbarem ganzzahligem SOC werden Energie und
  Verbrauch als `—` und nicht als `0` angezeigt.

### Ladehistorie und Ladekurven

- Beobachtete Ladevorgänge stammen aus den Home-Assistant-ON/OFF-Grenzen und
  behalten ihre SOC-Samples sowie Ladekurve.
- Historische Ladevorgänge ohne Live-Beobachtung werden aus einem SOC-Anstieg
  zwischen zwei echten Serverfahrten rekonstruiert.
- Ein rekonstruierter Eintrag zeigt nur das Standfenster, nicht fälschlich die
  gesamte Standzeit als Ladezeit.
- Bei rekonstruierter Historie bleiben Ladezeit, Durchschnittsleistung und
  Ladekurve unbekannt, sofern keine Live-Samples vorhanden sind.
- Beobachtete Ladeeinträge können aufgeklappt und über **Ladekurve anzeigen**
  direkt im Ladekurven-View geöffnet werden.
- Mehrere beobachtete Ladeabschnitte im gleichen Parkfenster bleiben getrennte
  Sessions; ein zusätzlicher rekonstruierter Duplikat-Eintrag wird unterdrückt.
- SOC-basierte Ladeenergie bleibt als Näherung der batterie-seitigen
  Energieänderung gekennzeichnet.

### Historie über 90 Tage

Die 90 Tage sind der Standard-Anzeige-/Recorder-Zeitraum, keine Löschgrenze
für die package-eigene Serverhistorie. Serverseitige Fahrten und archivierte
beobachtete Lade-Sessions bleiben im lokalen Store verfügbar. Die vollständige
Fahrthistorie wird im Fahrten-View über Scroll-Nachladen dargestellt. Für neue
Ladekurven müssen die zugehörigen Home-Assistant-/Recorder-Samples innerhalb
der Recorder-Aufbewahrung erfasst worden sein.

## Bedienung nach dem Update

Für Nutzer ist keine zusätzliche Konfiguration erforderlich.

Nach Installation oder Aktualisierung:

1. Home Assistant neu starten.
2. Das e-C3-Dashboard neu laden.
3. Bei Browsern mit starkem Cache eine harte Aktualisierung ausführen.
4. In der HA-App die App gegebenenfalls vollständig schließen und erneut
   öffnen.

Danach kann die Kartenansicht wie bisher geöffnet werden. Der Fix arbeitet
automatisch im Hintergrund.

## Technische Umsetzung

Neue Datei:

```text
custom_components/e_c3_dashboard/static/map-marker-fix.js
```

Die Datei wird über die bestehende Frontend-Resource-Infrastruktur als
versionierte Lovelace-Resource registriert:

```text
/e_c3_dashboard/map-marker-fix.js?v=0.5.24
```

Zusätzlich wird sie über `StaticPathConfig` unter dem Paketpfad ausgeliefert.
Die Frontend-Version wurde auf `0.5.24` erhöht.

Der e-C3-Marker erhält in der Dashboard-Strategie eine private Opt-in-
Eigenschaft:

```css
--ec3-transparent-picture-marker: 1;
```

Der Shim wartet auf die Registrierung von `map-card-entity-marker` und sucht
nur bei opt-in Hosts im Shadow DOM nach:

```html
<div class="marker picture dark">
```

Dort werden direkt gesetzt:

```css
background: transparent !important;
background-color: transparent !important;
```

Der Patch wird bei neu verbundenen Markern, nach Lit-Element-Updates sowie bei
bereits vorhandenen Markern angewendet. Die Hook-Installation ist über ein
Symbol idempotent.

## Warum die frühere Änderung nicht ausreichte

Die ursprünglichen CSS-Angaben wurden an den äußeren
`map-card-entity-marker`-Host übergeben. Der sichtbare schwarze Hintergrund
entsteht jedoch am inneren `.marker.picture.dark` innerhalb des Shadow DOM von
`ha-map-card`.

Deshalb konnten CSS-Variablen und `background-color` am äußeren Host je nach
Browser wirkungslos bleiben. Der neue Shim setzt die Werte am tatsächlich
gerenderten inneren Marker.

## Abgrenzung und Sicherheit

Der Shim greift ausschließlich bei `map-card-entity-marker`-Hosts mit der
privaten e3-Opt-in-Eigenschaft ein. Er verändert keine globale CSS-Regel von
`ha-map-card`, keine HACS-Dateien und keine anderen Marker. Er benötigt weder
`card-mod` noch eine Browser-Erweiterung und greift nicht in Stellantis-,
Recorder- oder OAuth-Daten ein.

Wenn `ha-map-card` seine interne Struktur künftig ändert, findet der Shim den
Selektor `.marker.picture` nicht mehr und lässt den Marker unverändert.

## Tests und Auslieferung

Durchgeführt wurden JavaScript-Syntaxprüfung mit `node --check`,
Whitespace-/Patch-Prüfung mit `git diff --check`, die Prüfung der versionierten
Lovelace-Resource sowie ein Browser-Test im Dark Mode gegen den manuellen Fix
`background-color: transparent !important`.

Repository-Stände:

- `CaneTLOTW/e_c3_dashboard`, Branch `develop`: Commit `607f233` für den
  Shim;
- `CaneTLOTW/HA_heimdall`, Branch `main`: integrierter Stand mit Shim und
  Resource-Registrierung.

## Fehlerdiagnose im Browser

Falls der schwarze Hintergrund nach einem Update erneut erscheint, zuerst
einen vollständigen Browser-Reload durchführen. Im Browser-Inspector muss die
Karte ungefähr so aussehen:

```text
map-card-entity-marker
└─ #shadow-root
   └─ div.marker.picture.dark
```

Der e3-Shim setzt am inneren Marker die beiden Inline-Eigenschaften
`background` und `background-color` auf transparent. Der äußere Host muss die
Custom Property `--ec3-transparent-picture-marker: 1` enthalten.

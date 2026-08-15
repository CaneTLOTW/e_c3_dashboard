/* Shared localisation primitives for the bundled Lovelace modules.
 *
 * HA's translation loader is available to config/options flows, but custom
 * browser modules are rendered independently for every user.  They therefore
 * use this small package-owned catalog and honour the browser/UI language (or
 * an explicit card ``language`` option) without relying on global HA state.
 */
export const FRONTEND_TEXT = {
  tripHistory: {
    de: {
      title: "Fahrtenhistorie", loading: "Fahrtenhistorie wird geladen …",
      error: "Historie konnte nicht geladen werden:", empty: "Keine Fahrten im gewählten Zeitraum.",
      scroll: "Fahrtenhistorie vertikal scrollen", date: "Datum", duration: "Dauer",
      distance: "Strecke", average: "Ø km/h", energy: "kWh", consumption: "kWh/100 km", maximum: "Max. km/h", startMileage: "Startkilometer", endMileage: "Endkilometer",
    },
    en: {
      title: "Trip history", loading: "Loading trip history …",
      error: "Could not load history:", empty: "No trips in the selected period.",
      scroll: "Scroll trip history vertically", date: "Date", duration: "Duration",
      distance: "Distance", average: "Avg. km/h", energy: "kWh", consumption: "kWh/100 km", maximum: "Max. km/h", startMileage: "Start mileage", endMileage: "End mileage",
    },
  },
  chargeHistory: {
    de: {
      title: "Ladehistorie", loading: "Ladehistorie wird geladen …",
      error: "Historie konnte nicht geladen werden:", empty: "Keine abgeschlossenen Ladevorgänge im gewählten Zeitraum.",
      start: "Start", duration: "Dauer", energy: "kWh", average: "Ø kW", maximum: "Max. kW", type: "Typ",
      hint: "kWh und kW sind batterieseitige Schätzwerte aus dem aufgezeichneten SOC-Verlauf.",
      curve: "Ladekurve", active: "● lädt", latest: "letzter Ladevorgang",
      curveLoading: "Ladekurve wird geladen …", curveError: "Ladekurve konnte nicht geladen werden:",
      selectionNotFound: "Der ausgewählte Ladevorgang ist im geladenen Recorder-Zeitraum nicht verfügbar.",
      notEnoughPoints: "Für diesen Ladevorgang liegen nicht genug SOC-Schritte vor.",
      powerOverSoc: "Ladeleistung über SOC", power: "Ø Leistung", sessions: "Vorgänge",
      selectSession: "Ladevorgang auswählen",
      curveHint: "Leistung je SOC-Schritt, batterieseitig aus SOC und Zeit abgeleitet. Die Kurve bleibt bis zum nächsten bestätigten Fahrtbeginn sichtbar.",
      browserHint: "batterieseitig aus SOC und Zeit abgeleitet. Verfügbar im Recorder-Zeitraum.",
    },
    en: {
      title: "Charging history", loading: "Loading charging history …",
      error: "Could not load history:", empty: "No completed charging sessions in the selected period.",
      start: "Start", duration: "Duration", energy: "kWh", average: "Avg. kW", maximum: "Max. kW", type: "Type",
      hint: "kWh and kW are battery-side estimates derived from the recorded SOC history.",
      curve: "Charge curve", active: "● charging", latest: "most recent charge",
      curveLoading: "Loading charge curve …", curveError: "Could not load charge curve:",
      selectionNotFound: "The selected charging session is not available in the loaded Recorder period.",
      notEnoughPoints: "Not enough usable SOC steps are available for this charging session.",
      powerOverSoc: "Charging power over SOC", power: "Avg. power", sessions: "sessions",
      selectSession: "Select charging session",
      curveHint: "Power per SOC step, derived on the battery side from SOC and time. The curve remains visible until the next confirmed trip starts.",
      browserHint: "derived on the battery side from SOC and time. Available within the Recorder retention period.",
    },
  },
  dashboard: {
    en: {
      name: "e-C3 Dashboard", description: "Vehicle dashboard for Stellantis Vehicles",
      setup: "Setup required", noVehicle: "No e-C3 Dashboard vehicle is configured yet.",
      configure: "Set up e-C3 Dashboard in Settings → Devices & services, then reopen this dashboard.",
      dependencies: "Required dashboard cards are missing", install: "Install these HACS dependencies, restart Home Assistant, then refresh this page:",
      status: "Connection and setup status", vehicle: "Vehicle", overview: "Overview", live: "Live",
      consumptionUsage: "Consumption & usage", quickActions: "Quick actions", chargingRange: "Charging & range", longTermStatistics: "Long-term statistics", longTermStatisticsIntro: "These charts use Home Assistant long-term statistics. Older hourly values remain available as long as the source entity provides a supported state class.", sohCapacityHistory: "SOH capacity", sohResistanceHistory: "SOH resistance", mileageHistory: "Odometer", drivenDistanceHistory: "Distance driven per month", consumptionHistory: "Average consumption (500 km)",
      chargeLimit: "Charging limit", chargeStart: "Charging start", highVoltageBattery: "High-voltage battery", lastCharge: "Last charge",
      batteryHealthCapacity: "SOH capacity", batteryHealthResistance: "SOH resistance", position: "Position", vehicleDetails: "Vehicle",
      batteryHealth: "Battery health", latestActivities: "Latest activity", settings: "Settings", commandStatus: "Last remote command",
      battery: "Battery", range: "Range", mileage: "Odometer", temperature: "Vehicle temperature", doors: "Doors",
      alarm: "Alarm system", privacy: "Data privacy", remote: "Remote connection", climate: "Preconditioning", cable: "Charging cable",
      chargeStatus: "Charging status", startCharging: "Start charging", stopCharging: "Stop charging", startClimate: "Start climate", stopClimate: "Stop climate",
      lastTrip: "Last trip", trailingConsumption: "Avg. consumption (500 km)", distanceSinceCharge: "Distance since last charge", currentTripEnergy: "Current trip energy",
      tripHistory: "Trip history", chargeHistory: "Charging history", chargeCurves: "Charging curves", historicalChargeCurves: "Historical charge curves", selectChargeCurve: "Select charge curve",
      chargeCurvesIntro: "Select a completed AC or DC charging session from the last {days} days. Power is derived on the battery side from integer SOC reports and time.",
      interpretation: "Interpretation", chargeCurvesNotes: "- **AC** is shown in blue, **DC** in green.\n- Gaps or decreasing SOC reports are ignored.\n- Power is not a measurement from the charging station and excludes charging losses.\n- The live curve for the current or most recent charge remains in the **Vehicle** view.",
      recentTrack: "Recent route", currentPosition: "Current position", gpsIntro: "Select the desired period above. The map shows GPS points stored by the Home Assistant Recorder. Their spacing depends on the positions actually supplied by Stellantis; a continuous route is therefore not guaranteed. Experience shows that GPS data are usually sent only at the end of a trip. For larger periods, straight lines can connect separate trips.",
      currentVehiclePosition: "Current vehicle position", coordinates: "Coordinates", latitude: "Latitude", longitude: "Longitude", gpsAccuracy: "GPS accuracy", positionUpdate: "Position update", noGpsCoordinates: "No GPS coordinates available.",
      manualWakeup: "Wake vehicle now", system: "System", mappedEntities: "Mapped upstream entities", trips: "Trips", charging: "Charging", gps: "GPS history", wakeup: "Wake-up", notifications: "Notifications", notificationRecipients: "Recipients", vehicleAlerts: "Vehicle alerts", tripReports: "Trip reports", chargeReports: "Charge reports", hourlyWakeup: "Hourly wake-up", chargeWakeup: "Wake-up while charging", availabilityProbe: "Availability probe", testNotification: "Send test notification",
      help: "Functions & usage", helpContent: "## Using this dashboard\n\n### Vehicle view\n- Tap the battery, range, temperature, connection or vehicle-detail cards to open Home Assistant's more-info dialog.\n- The green battery bar and pulsing state indicate an active charging process. A blue bar is the normal stationary state.\n- A missing or unavailable upstream value is shown as a safe placeholder or the affected optional card is omitted.\n\n### Trip history\n- Tap a trip row to expand its details directly below the row. Start and end mileage are shown when available.\n- Duration, distance, speed and energy may be estimates because Stellantis does not provide every value at every update.\n\n### Charging history\n- Tap a charging row to open the Charging view with exactly that session selected.\n- In the Charging view, use the selector to inspect another session and its curve.\n- Charging energy and power are battery-side estimates derived from SOC and time; they are not a charging-station measurement.\n\n### Controls\n- Use Quick actions for preconditioning.\n- Use Charging & range for charging status, charging type, charge end, charging power, cable state, charge limit and charging start.\n- Wake-up controls and availability diagnostics are grouped in the Wake-up view. Notifications are disabled after installation until explicitly enabled.\n\n### GPS and data quality\n- The GPS view shows Recorder-stored positions for the selected period. Sparse points and straight connections between trips are expected when the vehicle API reports only occasional positions.\n- The System view shows the mapped upstream entities and the integration status. Optional features disappear safely when their required entity is not available.",
      noRecipients: "Select Notify recipients in the e-C3 Dashboard integration options. All notification and wake-up switches are off after installation.",
      trackerUnavailable: "The selected Stellantis device currently has no usable vehicle tracker.", multipleVehicles: "More than one e-C3 Dashboard setup was found. Dashboard selection will be added with the multi-vehicle module.", upstreamIncompatible: "Stellantis Vehicles is not compatible. Required: {minimum}; installed: {installed}.",
    },
    de: {
      name: "e-C3 Dashboard", description: "Fahrzeug-Dashboard für Stellantis Vehicles",
      setup: "Einrichtung erforderlich", noVehicle: "Es ist noch kein e-C3-Dashboard-Fahrzeug eingerichtet.",
      configure: "Richte e-C3 Dashboard unter Einstellungen → Geräte & Dienste ein und öffne dieses Dashboard danach erneut.",
      dependencies: "Erforderliche Dashboard-Karten fehlen", install: "Installiere diese HACS-Abhängigkeiten, starte Home Assistant neu und lade diese Seite anschließend neu:",
      status: "Verbindungs- und Einrichtungsstatus", vehicle: "KFZ", overview: "Übersicht", live: "Live",
      consumptionUsage: "Verbrauch & Nutzung", quickActions: "Schnellaktionen", chargingRange: "Laden & Reichweite", longTermStatistics: "Langzeitstatistik", longTermStatisticsIntro: "Diese Diagramme verwenden die Home-Assistant-Langzeitstatistik. Ältere Stundenwerte bleiben verfügbar, solange die Quell-Entity eine unterstützte state_class besitzt.", sohCapacityHistory: "SOH Kapazität", sohResistanceHistory: "SOH Widerstand", mileageHistory: "Kilometerstand", drivenDistanceHistory: "Gefahrene Strecke pro Monat", consumptionHistory: "Ø Verbrauch (500 km)",
      chargeLimit: "Ladelimit", chargeStart: "Ladebeginn", highVoltageBattery: "Hochvoltbatterie", lastCharge: "Letzte Ladung",
      batteryHealthCapacity: "SOH Kapazität", batteryHealthResistance: "SOH Widerstand", position: "Position", vehicleDetails: "Fahrzeug",
      batteryHealth: "Batteriegesundheit", latestActivities: "Letzte Aktivitäten", settings: "Einstellungen", commandStatus: "Letzter Fernbefehl",
      battery: "Batterie", range: "Reichweite", mileage: "Kilometerstand", temperature: "Fahrzeugtemperatur", doors: "Türen",
      alarm: "Alarmanlage", privacy: "Datenschutz", remote: "Remote-Verbindung", climate: "Vorklimatisierung", cable: "Ladekabel",
      chargeStatus: "Ladestatus", startCharging: "Laden starten", stopCharging: "Laden stoppen", startClimate: "Klima starten", stopClimate: "Klima stoppen",
      lastTrip: "Letzte Fahrt", trailingConsumption: "Ø Verbrauch 500 km", distanceSinceCharge: "Seit letzter Ladung", currentTripEnergy: "Aktuelle Fahrtenergie",
      tripHistory: "Fahrtenhistorie", chargeHistory: "Ladehistorie", chargeCurves: "Ladekurven", historicalChargeCurves: "Historische Ladekurven", selectChargeCurve: "Ladekurve auswählen",
      chargeCurvesIntro: "Wähle einen abgeschlossenen AC- oder DC-Ladevorgang aus den letzten {days} Tagen. Die Leistung ist batterieseitig aus den ganzzahligen SOC-Meldungen und der Zeit abgeleitet.",
      interpretation: "Einordnung", chargeCurvesNotes: "- **AC** wird blau, **DC** grün dargestellt.\n- Lücken oder rückläufige SOC-Meldungen werden ignoriert.\n- Die Leistung ist keine Messung der Ladesäule und enthält keine Ladeverluste.\n- Für den jeweils aktuellen beziehungsweise letzten Ladevorgang bleibt die Live-Kurve im View **KFZ** zuständig.",
      recentTrack: "Letzte Route", currentPosition: "Aktuelle Position", gpsIntro: "Wähle oben den gewünschten Zeitraum. Angezeigt werden die im HA-Recorder gespeicherten GPS-Punkte des Fahrzeugs. Die Abstände hängen von den tatsächlich gelieferten Stellantis-Positionsdaten ab; eine lückenlose Route ist daher nicht garantiert. Die Erfahrung zeigt, dass GPS-Daten meist erst bei Fahrtende gesendet werden. Bei größeren Zeiträumen können getrennte Fahrten durch gerade Linien miteinander verbunden werden.",
      currentVehiclePosition: "Aktuelle Fahrzeugposition", coordinates: "Koordinaten", latitude: "Breitengrad", longitude: "Längengrad", gpsAccuracy: "GPS-Genauigkeit", positionUpdate: "Positionsupdate", noGpsCoordinates: "Keine GPS-Koordinaten verfügbar.",
      manualWakeup: "Fahrzeug jetzt aufwecken", system: "System", mappedEntities: "Zugeordnete Upstream-Entitäten", trips: "Fahrten", charging: "Laden", gps: "GPS-Historie", wakeup: "Wake-up", notifications: "Benachrichtigungen", notificationRecipients: "Empfänger", vehicleAlerts: "Fahrzeugwarnungen", tripReports: "Fahrtberichte", chargeReports: "Ladeberichte", hourlyWakeup: "Stündlicher Wake-up", chargeWakeup: "Wake-up beim Laden", availabilityProbe: "Erreichbarkeitsprobe", testNotification: "Testnachricht senden",
      help: "Funktionen & Bedienung", helpContent: "## Bedienung dieses Dashboards\n\n### Fahrzeugansicht\n- Batterie, Reichweite, Temperatur, Verbindung und Fahrzeugdetails können angetippt werden und öffnen den Home-Assistant-Dialog mit weiteren Informationen.\n- Der grüne Ladebalken und der pulsierende Zustand zeigen einen aktiven Ladevorgang. Blau kennzeichnet den normalen, statischen Zustand.\n- Fehlende oder nicht verfügbare Upstream-Werte werden sicher als Platzhalter angezeigt; optionale Karten werden bei fehlender Entity ausgeblendet.\n\n### Fahrtenhistorie\n- Eine Fahrtzeile antippen, um direkt darunter die Detailzeile zu öffnen. Start- und Endkilometer werden angezeigt, sofern vorhanden.\n- Dauer, Strecke, Geschwindigkeit und Energie können Näherungswerte sein, da Stellantis nicht jeden Wert bei jedem Update übermittelt.\n\n### Ladehistorie\n- Eine Ladezeile antippen, um in den View **Ladekurven** zu springen und genau diesen Ladevorgang zu öffnen.\n- Im View **Ladekurven** kann über den Auswahlregler ein anderer Vorgang geöffnet werden.\n- Ladeenergie und Ladeleistung werden batterieseitig aus SOC und Zeit abgeleitet; sie sind keine Messung der Ladesäule.\n\n### Steuerungen\n- Über **Schnellaktionen** lässt sich die Vorklimatisierung starten oder stoppen.\n- Unter **Laden & Reichweite** stehen Ladestatus, Ladeart, Ladeende, Ladeleistung, Kabelstatus, Ladelimit und Ladebeginn zur Verfügung.\n- Wake-up-Steuerungen und Erreichbarkeitsdiagnose befinden sich im View **Wake-up**. Benachrichtigungen sind nach der Installation zunächst deaktiviert und müssen ausdrücklich aktiviert werden.\n\n### GPS und Datenqualität\n- Der GPS-View zeigt die im HA-Recorder gespeicherten Positionen für den ausgewählten Zeitraum. Wenige Punkte und gerade Verbindungen zwischen Fahrten sind erwartbar, wenn die Fahrzeug-API nur gelegentliche Positionen meldet.\n- Der System-View zeigt die zugeordneten Upstream-Entitäten und den Integrationsstatus. Optionale Funktionen werden sicher ausgeblendet, wenn die benötigte Entity nicht verfügbar ist.",
      noRecipients: "Wähle Notify-Empfänger in den Optionen der e-C3-Dashboard-Integration aus. Nach der Installation sind alle Benachrichtigungs- und Wake-up-Schalter ausgeschaltet.",
      trackerUnavailable: "Das ausgewählte Stellantis-Gerät besitzt derzeit keinen nutzbaren Fahrzeug-Tracker.", multipleVehicles: "Es wurden mehrere e-C3-Dashboard-Einrichtungen gefunden. Die Auswahl folgt mit dem Mehrfahrzeug-Modul.", upstreamIncompatible: "Stellantis Vehicles ist nicht kompatibel. Erforderlich: {minimum}; installiert: {installed}.",
    },
  },
};

export function languageFor(context) {
  const explicit = context?.language;
  if (explicit === "de" || explicit === "en") return explicit;
  const requested = context?.locale?.language || navigator.language || "en";
  return requested.toLowerCase().startsWith("de") ? "de" : "en";
}

export function localeFor(context) {
  return languageFor(context) === "de" ? "de-DE" : "en";
}

export function textFor(context, namespace) {
  return FRONTEND_TEXT[namespace][languageFor(context)];
}

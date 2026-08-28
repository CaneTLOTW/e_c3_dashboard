# Remote-Verbindung / Fernbefehle nicht verfügbar

Am 28.08.2026 sind Remote-Verbindung und letzter Fernbefehl sowohl im neuen e-C3 Dashboard als auch im alten KFZ-Dashboard nicht verfügbar, obwohl normale Fahrzeugtelemetrie aktualisiert wird. Deshalb zunächst als Upstream-/Capability-/Remote-Channel-Thema klassifizieren, nicht als e-C3-Frontendfehler.

Vor Änderungen read-only prüfen: gemappte Upstream-Entities, Config-Entry-Zustand, Verfügbarkeit/Zeitstempel sowie Stellantis-Vehicles-Logs. Keine realen Fernbefehle ungefragt zu Diagnosezwecken auslösen.

Technische Details: `DIAG_REMOTE_CHANNEL_UNAVAILABLE_2026-08-28.md`.

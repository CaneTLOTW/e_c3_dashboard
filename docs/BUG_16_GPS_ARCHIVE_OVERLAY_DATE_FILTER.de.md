# GPS-Historie: Fahrtenarchiv ignoriert Datumsfilter

Der Datumswähler filtert aktuell nur die Recorder-Historie. Das orange Stellantis-Server-GeoJSON enthält dagegen alle kanonischen Fahrten und bleibt deshalb unabhängig vom gewählten Datum vollständig sichtbar.

Soll: Beide Layer müssen denselben ausgewählten Zeitraum verwenden. Ein vollständiges Fahrtenarchiv darf nur als ausdrücklich gewählte separate Ansicht erscheinen.

Technische Details: `BUG_16_GPS_ARCHIVE_OVERLAY_DATE_FILTER.md`.

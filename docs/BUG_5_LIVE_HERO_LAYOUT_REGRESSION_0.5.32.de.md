# LIVE-Hero 0.5.32 weiterhin leer

Die Live-Abnahme hat 0.5.32 als visuell FAIL bestätigt: Tracker und `entity_picture` sind vorhanden, das Fahrzeugbild bleibt im Hero dennoch leer.

Ursache im Kompatibilitätspatch: Beim Entfernen des statischen `background-image` wurde der komplette Style-Block verworfen. Weil derselbe Block auch `position: relative`, `height: 270px` und `overflow: hidden` enthält, verlor das neu injizierte reaktive Bild seinen Layout-Kontext.

0.5.33 entfernt nur noch die Background-Eigenschaften und bewahrt die Layout-Eigenschaften. Der Test bildet nun genau diesen kombinierten realen Style-Block nach.

Technische Details: `BUG_5_LIVE_HERO_LAYOUT_REGRESSION_0.5.32.md`.

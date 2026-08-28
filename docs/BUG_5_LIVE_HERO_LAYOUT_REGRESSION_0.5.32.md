# Issue #5 follow-up: 0.5.32 reactive hero still blank

Live visual verification on 2026-08-28 showed that the vehicle image in the LIVE hero remained blank after deploying 0.5.32, despite the tracker exposing a valid `entity_picture` and the PNG being served successfully.

## Root cause found in the 0.5.32 compatibility patch

`withoutStaticVehicleBackground()` removed an entire style object whenever that object contained one of the legacy background properties. The actual hero stores layout and background properties in the same style object, including:

- `position: relative`
- `height: 270px`
- `overflow: hidden`
- border radius / padding
- `background-image`
- background sizing/position

Dropping the whole object therefore also dropped the positioning/height context needed by the newly injected absolute reactive image.

## Fix

Develop 0.5.33 removes only the obsolete background-related keys from each style object and preserves all unrelated layout keys. The regression test now models the real combined style object and asserts that `position`, `height` and `overflow` survive while `background-image` is removed.

Candidate commits:

- `5006ae751e8e9032c3f54ca045055c0feb73363c` – preserve hero layout while stripping static background
- `d0f6488861ae4ee46991b48112e118c1e6baaac5` – frontend 0.5.33
- `82dacf11920d6747672ee6cf5a1873c41f8c07cf` – integration 0.5.33
- `67fdcab5f5fd23741239cc0a533a595a3f512e65` – regression test

The exact next runtime candidate is the current `develop` SHA after these commits. Do not promote to `main` until the LIVE hero is visually verified in browser/app.

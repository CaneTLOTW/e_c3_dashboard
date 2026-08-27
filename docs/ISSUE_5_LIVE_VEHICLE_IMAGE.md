# Issue #5 – Live vehicle hero image intermittently disappears

Status: open / investigation prepared
Issue: https://github.com/CaneTLOTW/e_c3_dashboard/issues/5
Date: 2026-08-28

## Purpose

This note preserves the technical investigation for the intermittent missing
vehicle image in the automatically generated `vehicle` / `Live` view. It is
intentionally documentation only; no frontend behaviour is changed by this
commit.

## Symptoms

- The Live hero renders range, outside temperature and SOC, but the vehicle
  picture area is empty.
- F5 / browser reload often makes the picture appear again.
- After later state or strategy renders the image can disappear again.
- The older manually maintained vehicle card usually shows the image, but it
  still has a dark/black picture background problem in dark mode.
- The regression was first noticed around the work that separated the vehicle
  picture from the map-marker dark-mode background fix.

## Relevant code states

### Productive Home Assistant / Heimdall

The runtime package currently reports frontend/integration version `0.5.31` and
is functionally very close to `e_c3_dashboard:develop`.

Its `static/map-marker-fix.js` contains the scoped transparency fix for
`map-card-entity-marker`, but does **not** contain the complete reactive Live
hero patch that exists on `main`.

### `develop`

The same architectural behaviour as the productive runtime: the map marker is
patched, while the Live hero still depends on the picture state available while
the dashboard strategy is generated.

### `main`

`static/map-marker-fix.js` additionally contains a reactive Live hero patch.
The important parts are:

1. Locate the generated `vehicle` view.
2. Locate the Live hero `custom:button-card`.
3. Resolve the selected dashboard's `vehicle_tracker` from the e-C3 status
   entity instead of from an installation-specific ID.
4. Add the tracker to `triggers_update`.
5. Remove the static vehicle background properties from the hero.
6. Replace the image area by a tracker-bound nested `custom:button-card`.
7. Render a real `<img>` from `entity.attributes.entity_picture` on each
   relevant update.
8. Keep the map-marker transparency shim logically separate.

This specifically covers the case where `entity_picture` is unavailable during
the first strategy build but becomes available shortly afterwards.

## Root-cause hypothesis

The strongest current hypothesis is a frontend race/reactivity problem:

```text
strategy generation
    -> tracker/entity mapping is available
    -> entity_picture may still be empty
    -> hero config freezes the empty picture value
    -> later tracker update does not rebuild that static background
```

A full browser reload often succeeds because the tracker picture has already
arrived before the strategy is regenerated.

The behaviour therefore does not look like a broken image URL or a generic
browser cache problem.

## Separate concerns

Two image problems must remain independent:

### A. Map marker

The car marker in the GPS/Position map must use a transparent background in
both light and dark mode.

### B. Live hero

The large car picture in the Live view must react to the tracker
`entity_picture` and remain visible through state updates/re-renders.

A solution must not solve one by regressing the other.

## Investigation plan for the next work session

1. Reproduce with browser DevTools open.
2. Record the selected `vehicle_tracker` state and `entity_picture`:
   - immediately before entering the dashboard,
   - after the empty hero is rendered,
   - after F5 when the image appears.
3. Confirm whether the tracker picture URL itself stays valid while the hero is
   blank.
4. Compare only the relevant Live-picture code across:
   - runtime `0.5.31`,
   - repository `develop`,
   - repository `main`.
5. Test the `main` reactive Live patch in isolation on top of the runtime/
   `develop` behaviour.
6. If the monkey-patch approach is reliable, either keep it as a scoped
   compatibility shim or move the same reactive binding directly into the
   dashboard strategy for a cleaner long-term implementation.
7. Bump frontend/static version so HA browser/app caches cannot retain the old
   JavaScript.

Do **not** merge `main` wholesale into `develop` for this bug. The branches are
diverged and both contain desired changes that need separate migration review.

## Acceptance criteria

- Vehicle picture appears without F5 as soon as the tracker has an
  `entity_picture`.
- Late `entity_picture` arrival updates the hero automatically.
- Re-renders/state changes do not drop the picture.
- Hero picture background is transparent in light and dark mode.
- GPS vehicle marker background remains transparent in light and dark mode.
- Browser and HA app tested.
- No new console errors.
- No regression in Trips, Charging, GPS or Statistics views.

## Scope exclusions

Not part of issue #5:

- general `main`/`develop` reconciliation,
- reusable Vehicle Overview start-page card,
- `stellantis_drive_metrics` migration,
- entity/unique-ID migration.

Those remain migration-audit topics and must be decided independently.

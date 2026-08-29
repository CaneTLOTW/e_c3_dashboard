# Codex Runtime Handoff — e-C3 Dashboard 0.5.52

## Role and scope

This is a **deployment + runtime smoke test** for an already prepared source candidate. Do not start a broad implementation pass.

Repository: `CaneTLOTW/e_c3_dashboard`
Branch: `develop`
Previous runtime: `0.5.51`
Target: exact 0.5.52 candidate referenced by the latest `CaneTLOTW/e_c3_dashboard#24` ChatGPT handoff.

The user has already accepted the general 0.5.51 layout. This pass is intentionally narrow:

1. restore the specific package control labels that were replaced by the dashboard device name;
2. verify the shared preconditioning icon reacts visibly in both the start-page card and the Vehicle LIVE hero;
3. preserve the current loader/dependency behavior and all unrelated working functionality.

## Prepared source changes

### Package entity naming

`switch.py`, `button.py`, `number.py` and `time.py` keep Home Assistant entity-name semantics enabled (`_attr_has_entity_name = True`) so translation keys remain the canonical entity names instead of the whole visible name collapsing to the dashboard device name.

Do not rename entity IDs or detach the entities from the package device.

### Dashboard labels

The bundled frontend translation catalog now explicitly defines the labels used by the Wake-up and Notifications cards.

German runtime expectations:

- `Benachrichtigungen`
- `Fahrzeugwarnungen`
- `Fahrtberichte`
- `Ladeberichte`
- `Testbenachrichtigung`
- `Stündlicher Wake-up`
- `Erreichbarkeitsprobe mit Wake-up`
- `Wake-up beim Laden`
- `Fahrzeug jetzt aufwecken`
- `Remote-Verbindung`

No VIN-like/device-dashboard prefix should replace these labels in the package dashboard cards.

Recipient selection/recipient switches are not being redesigned in this pass. Preserve the user's selected recipient(s) and all existing notification switch states.

### Shared preconditioning visual

`vehicle-overview-card.js` is the canonical component used both by:

- the reusable Home Assistant start-page vehicle card; and
- the Vehicle view LIVE hero.

The visual now uses the real mapped Stellantis preconditioning binary sensor as the authoritative state. To bridge normal upstream command-status latency, a recently pressed package start button may optimistically mark the visual active for a bounded period only while the source binary sensor has not yet answered after that press. A later source update wins. A later stop press cancels the optimistic start.

This is **presentation-only**. Never use this optimistic visual state as availability, heartbeat or notification recovery evidence.

Expected visual when preconditioning is active:

- vehicle temperature `<= 20 °C`: red icon/background, heating/radiator visual;
- vehicle temperature `> 20 °C`: blue icon/background, air-conditioning visual;
- unknown temperature: neutral visual;
- inactive/fresh source off: neutral visual.

The icon itself must visibly change colour, not only its background.

## Explicit non-scope

Do not change any of the following in this pass:

- `frontend.js` loader/dependency algorithm beyond the already prepared 0.5.52 cache strings;
- Bubble Card / Button Card / ha-map-card / layout-card dependency policy;
- GPS source colours, period selection or date bridge;
- notification event semantics, quiet-hour logic, heartbeat semantics or recipient discovery behavior;
- trip repair/reconciliation logic;
- mileage/long-term-statistics repair;
- 500-km consumption calculation;
- Stellantis integration source;
- `main`.

## Deployment

1. Confirm the latest ChatGPT handoff in `CaneTLOTW/e_c3_dashboard#24` gives the exact candidate SHA and a green Validate run for that SHA.
2. If practical, create a package-only backup. If available disk space prevents a new backup, **do not delete databases, configuration or unrelated data to make room**. Report the condition and use the existing safe package-backup approach if available.
3. Sync exactly that candidate into `/homeassistant/custom_components/e_c3_dashboard`.
4. Verify the installed manifest and frontend resource correspond to 0.5.52, including `/e_c3_dashboard/frontend.js?v=0.5.52`.
5. Python entity classes changed. Perform a normal integration reload if sufficient; otherwise request **exactly one** normal Home Assistant Core restart.
6. After a normal wait, continue directly with the actual e-C3 checks. Do not run standalone MCP/8123/Supervisor/Registry health probes as acceptance gates. A restart-call disconnect/timeout is expected and is not by itself a failure.

## Runtime acceptance

### A. Strategy/loader smoke

- e-C3 dashboard opens without `Timeout waiting for strategy element ll-strategy-dashboard-e-c3-dashboard`.
- Start-page vehicle card renders normally.
- Do not modify the loader if this passes.

### B. Notification names

In the Notifications view verify the visible labels are the intended function names, especially:

- `Benachrichtigungen`
- `Fahrzeugwarnungen`
- `Fahrtberichte`
- `Ladeberichte`
- `Testbenachrichtigung`

The user's recipient remains selected/unchanged. Do not send a test notification unless needed and safe for the smoke test.

### C. Wake-up names

Verify:

- `Fahrzeug jetzt aufwecken`
- `Stündlicher Wake-up`
- `Erreichbarkeitsprobe mit Wake-up`
- `Wake-up beim Laden`
- `Remote-Verbindung`

No VIN-like/device-dashboard name should replace the functional labels.

### D. Preconditioning visual

Do not manufacture an inconvenient vehicle state solely for testing.

If the user/vehicle state makes a test convenient, start preconditioning normally and verify **both** the start-page card and Vehicle LIVE hero show the same active visual:

- `<=20 °C` → red;
- `>20 °C` → blue.

Verify the icon itself changes colour. If the mapped Stellantis binary sensor updates later, that real source state must become authoritative. After stop/fresh source-off the visual should return neutral.

If a live preconditioning test is not convenient now, report it as pending user acceptance rather than changing code.

## Small-repair rule

Only a tiny, unambiguous execution-local repair may be made if it is necessary to execute this exact smoke test. If used, report:

- file;
- exact change;
- reason;
- repeated test.

Anything affecting feature semantics, architecture, data model, loader policy or notification behavior: STOP and report it to ChatGPT instead of implementing it.

## Result format

Post to `CaneTLOTW/e_c3_dashboard#24`:

```markdown
## Codex → ChatGPT Ergebnis

### Candidate
- exact SHA / version:
- repository validation:

### Runtime
- exact synced SHA:
- frontend resource:
- reload/restart performed:
- no rollback / no main:

### Strategy / start card
- dashboard strategy:
- start-page card:

### Notification names
- Benachrichtigungen:
- Fahrzeugwarnungen:
- Fahrtberichte:
- Ladeberichte:
- Testbenachrichtigung:
- recipient preserved:

### Wake-up names
- Fahrzeug jetzt aufwecken:
- Stündlicher Wake-up:
- Erreichbarkeitsprobe mit Wake-up:
- Wake-up beim Laden:
- Remote-Verbindung:

### Preconditioning visual
- test performed:
- start-page card:
- Vehicle LIVE hero:
- source-state authority after update:

### Small local repair, if any
- none / exact report

### Remaining user acceptance
- ...
```

Then STOP. No `main` update.

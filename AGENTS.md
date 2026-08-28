# Maintainer notes for coding agents

This file is a compact operating guide for AI-assisted and automated changes.
It complements, rather than replaces, [CONTRIBUTING.md](CONTRIBUTING.md).

## Branch workflow

- Develop all features, fixes, documentation, and dependency updates on the
  `develop` branch. Do not commit directly to `main`.
- Test `develop` in a designated Home Assistant development installation using
  the HACS branch version. It replaces the same integration domain and is not
  a parallel stable installation.
- Merge a reviewed and validated pull request from `develop` into `main` only
  when it is ready for users. Create the corresponding GitHub release from
  `main`; HACS users track releases, not `develop`.

## Issue-based task and agent handoff workflow

- The GitHub Issue in `CaneTLOTW/e_c3_dashboard` is the canonical operative work item for bugs, features, migrations, investigations and follow-ups that are not completed immediately.
- Do **not** create or maintain a duplicate Home Assistant `todo.codex` item for e-C3 repository work. This repository owns its own backlog through GitHub Issues.
- Durable architecture, contracts and implementation decisions must still be committed to repository documentation/code; an Issue is the work thread, not the only technical documentation.
- Before creating a new Issue, search open and recently closed Issues for the same feature/problem and reuse the existing thread when appropriate.
- ChatGPT should prepare repository analysis, architecture, code, tests, documentation, mockups/artifacts and an executable runbook as far as possible before handing work to Codex.
- Codex is primarily the executor for work that needs the real Home Assistant runtime: deployment, real entity/config-entry resolution, reload/restart, runtime tests and collection of sanitized evidence.
- Codex may perform additional analysis/design when live runtime evidence invalidates the prepared assumptions or the task explicitly requires local investigation. Document the finding and resulting decision in the Issue and commit durable conclusions.
- Use Issue comments headed `## ChatGPT → Codex Handoff`, `## Codex → ChatGPT Ergebnis`, and `## ChatGPT Review / Next Step` for handoffs and iterative review.
- Handoff comments should reference the exact branch/commit, authoritative runbook or files, remaining runtime steps, acceptance criteria and areas that must not be changed.
- Codex result comments should include final commit/branch, runtime PASS/FAIL, relevant findings, generated reports/exports, blockers and remaining local changes.
- Keep an Issue open until its acceptance criteria and required runtime verification are complete; do not close it merely because code was committed.
- Prefer `Refs #<issue>` during development. Use `Fixes/Closes #<issue>` only when the work is genuinely ready to close after the repository's validation rules.

## Scope and architecture

- This repository is a portable companion integration for
  `andreadegiovine/homeassistant-stellantis-vehicles`; it must never call the
  Stellantis API directly.
- Select one upstream vehicle through the config flow. Discover and map its
  entities via the entity/device registries; never derive entity IDs from a
  VIN, a friendly name, or a hard-coded household slug.
- Keep package-owned metrics, session markers and notification state in the
  config-entry storage. Do not edit a user's `.storage` dashboard files or
  `configuration.yaml`.
- Dashboard JavaScript must use the integration's mapped status entity and
  remain safe when an upstream entity is missing, unavailable or changed.

## Privacy and compatibility

- Do not commit VINs, GPS tracks, screenshots containing private data, exports,
  tokens, recipient names, credentials, or raw Home Assistant config.
- Do not copy code from proprietary Stellantis applications. Use only the
  public upstream integration contract documented in the capability matrix.
- New functionality must degrade visibly and safely rather than pretending a
  remote command or data value is supported.

## User-facing text

- Config and options flow text belongs in `strings.json` plus `translations/`.
- Custom dashboard/card text belongs in `static/i18n.js`.
- Notification and Logbook text belongs in `i18n.py`.
- Add German and English together. Do not place language conditionals in
  calculations or notification logic.

## Validation before a pull request or release

Run at least:

```sh
python3 -m py_compile custom_components/e_c3_dashboard/*.py
node --check custom_components/e_c3_dashboard/static/i18n.js
node --check custom_components/e_c3_dashboard/static/e_c3_dashboard.js
node --check custom_components/e_c3_dashboard/static/trip-history-card.js
node --check custom_components/e_c3_dashboard/static/charge-history-card.js
python3 -m json.tool hacs.json
python3 -m json.tool custom_components/e_c3_dashboard/manifest.json
git diff --check
```

Test a fresh config entry and its automatically created dashboard on a
non-production instance before changing dashboard onboarding. Keep HACS, Home
Assistant Core and Stellantis Vehicles compatibility explicit in the docs.

# Maintainer notes for coding agents

This file is a compact operating guide for AI-assisted and automated changes.
It complements, rather than replaces, [CONTRIBUTING.md](CONTRIBUTING.md).

## Branch and deployment workflow

- Develop **all** features, fixes, documentation, tests, dependency changes and
  candidate version bumps on `develop`. Do not commit feature/fix work directly
  to `main`.
- The designated Home Assistant household instance is the acceptance/canary
  runtime for this project and may intentionally run an **exact `develop` SHA**.
  This is a live acceptance deployment, not a public/stable release.
- Every active runtime Issue must distinguish three states explicitly:
  - **Candidate** = exact `develop` SHA/version prepared in GitHub;
  - **Runtime** = exact SHA/version deployed into the active Home Assistant instance;
  - **Validated** = exact runtime SHA/version that passed the required live/user checks.
  Never describe a Candidate as deployed or validated merely because it exists on `develop`.
- Every Codex deployment must record the exact `develop` SHA it deploys and
  report PASS/FAIL against that same SHA in the relevant GitHub Issue.
- Home Assistant restart handling follows the normal deployment flow: when a
  Python/platform change requires a Core restart, request one restart, allow a
  normal startup interval, then continue with the next task-specific functional
  check. The restart request itself may lose its connection while Core stops.
- Runtime validation is **task-driven**. The next real integration/dashboard
  action is the normal proof that Home Assistant is usable for the task.
  Transport, management or health endpoints are diagnostic tools when a
  functional step actually fails or when connectivity is itself the subject of
  the task; they are not a separate prerequisite for ordinary e-C3 acceptance.
- If new commits land on `develop` after a deployment, the existing Runtime
  remains the previously deployed SHA until an explicit new deployment occurs.
  A later `develop` HEAD never silently changes the running Home Assistant copy.
- `main` represents the last accepted/publishable stable state. Before a stable
  promotion, `main` must be an ancestor of the validated `develop` SHA.
- After user/maintainer acceptance, promote the **exact validated `develop` SHA**
  to `main` by fast-forward only. Do not squash, rebase or cherry-pick the
  accepted change set during promotion.
- Create the stable tag/release from that exact `main` SHA. Do not add a
  main-only version bump after acceptance; any final version adjustment must be
  committed and validated on `develop` first.
- Never maintain the same fix independently on both long-lived branches. A
  direct-main hotfix lane is not permitted; emergency fixes still go through
  `develop`, the smallest safe runtime validation, and then fast-forward
  promotion.
- If GitHub reports `main` and `develop` as diverged, stop the next release and
  reconcile the histories in a maintenance Issue before continuing.
- Full rationale and the runtime/result contract are in
  [`docs/BRANCH_AND_DEPLOYMENT_WORKFLOW.md`](docs/BRANCH_AND_DEPLOYMENT_WORKFLOW.md).

## Temporary patches versus accepted source

- A temporary runtime/frontend patch is allowed only as a short-lived diagnostic
  experiment when it is materially faster or safer than changing the canonical
  implementation before the cause is understood.
- A successful test patch is **evidence, not the finished implementation**.
  Before user acceptance, stable promotion or release, fold the proven behavior
  into the canonical source/module that owns the feature, remove the temporary
  patch path, bump the candidate version when frontend caching is affected, and
  repeat the relevant repository plus runtime/browser/app tests.
- Do not accumulate post-generation Strategy wrappers, `customElements.define`
  interception, runtime monkey patches or multiple separately registered
  Lovelace resources merely because they worked during diagnosis.
- Prefer one package-owned frontend entry resource. Internal ES modules are
  encouraged for maintainability, but their load order and readiness are owned
  by that entry module rather than by independent Home Assistant resources.
- An unavoidable compatibility shim against a third-party component is allowed
  only when the required behavior cannot be expressed through its supported
  API/CSS contract. It must be narrowly opt-in, live in the canonical source,
  be documented with the upstream reason, have regression coverage, and never
  be mixed with unrelated feature logic.
- An Issue cannot become `Validated` while its accepted behavior still depends
  on a disposable diagnostic patch that has not been integrated and retested.

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

## Validation before runtime acceptance or release

Run at least:

```sh
python3 -m py_compile custom_components/e_c3_dashboard/*.py
node --check custom_components/e_c3_dashboard/static/frontend.js
node --check custom_components/e_c3_dashboard/static/i18n.js
node --check custom_components/e_c3_dashboard/static/e_c3_dashboard.js
node --check custom_components/e_c3_dashboard/static/vehicle-overview-card.js
node --check custom_components/e_c3_dashboard/static/gps-history-card.js
node --check custom_components/e_c3_dashboard/static/gps-history-core.js
node --check custom_components/e_c3_dashboard/static/trip-history-card.js
node --check custom_components/e_c3_dashboard/static/charge-history-card.js
node --check custom_components/e_c3_dashboard/static/charge-history-core.js
node --test tests/*.test.mjs
python3 -m json.tool hacs.json
python3 -m json.tool custom_components/e_c3_dashboard/manifest.json
git diff --check
```

For runtime acceptance, deploy the exact candidate `develop` SHA to the
assigned Home Assistant instance and record that SHA in the Issue result. Test
a fresh config entry when onboarding/config-flow behavior changed and test the
automatically created dashboard after frontend changes. Keep HACS, Home
Assistant Core and Stellantis Vehicles compatibility explicit in the docs.

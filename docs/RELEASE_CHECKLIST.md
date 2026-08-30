# Release checklist

This checklist complements `BRANCH_AND_DEPLOYMENT_WORKFLOW.md`. The exact validated commit is the release unit.

## 1. Branch health

Before starting or closing release work:

- [ ] implementation/documentation changes are on `develop`;
- [ ] `main` is an ancestor of `develop`;
- [ ] there are no independent main-only feature/fix commits;
- [ ] no force-push, squash, rebase or cherry-pick is planned between acceptance and stable promotion.

At a stable promotion boundary, `main` and `develop` should point to the same exact accepted SHA.

## 2. Version/cache coherence

For a runtime release:

- [ ] `custom_components/e_c3_dashboard/manifest.json` has the intended package version;
- [ ] `FRONTEND_VERSION` matches the intended frontend/cache version;
- [ ] every internal `?v=` frontend import uses the same version when frontend code changed;
- [ ] the HACS metadata/minimum Home Assistant requirement remains correct;
- [ ] no changed frontend is shipped under a cache key that was already served for different code.

Documentation-only cleanup does not require a package version bump when no runtime/browser asset changes.

## 3. Repository validation

The exact `develop` Candidate must pass the repository gates:

- [ ] Python compile checks;
- [ ] JavaScript syntax checks;
- [ ] Node regression suite;
- [ ] JSON validation;
- [ ] `git diff --check`/whitespace checks;
- [ ] HACS validation;
- [ ] Hassfest.

Record the exact Candidate SHA and Validate workflow run.

## 4. Functional/runtime acceptance

Runtime acceptance is required when the change affects Home Assistant behavior, data, entities or frontend output.

- [ ] deploy the exact Candidate SHA to the designated acceptance instance;
- [ ] record Candidate and actual Runtime SHA/version separately;
- [ ] perform the task-specific functional checks named by the active Issue/change;
- [ ] perform a normal Home Assistant reload/restart only when required by the changed code;
- [ ] do not add unrelated health/transport gates before functional acceptance;
- [ ] if a diagnostic patch proved a fix, integrate it into canonical source, remove the temporary path, create a new Candidate and retest the affected behavior;
- [ ] mark `Validated` only for the exact integrated Runtime SHA that actually passed the required checks.

For documentation-only changes, repository validation plus content review can be sufficient; do not invent a Home Assistant runtime deployment solely to validate Markdown.

## 5. User-facing checks

When applicable:

- [ ] generated dashboard opens successfully;
- [ ] Vehicle/Charging/Statistics/Trips/GPS/Wake-up/Notifications/System structure remains correct;
- [ ] compact vehicle-overview card works independently;
- [ ] German and English strings are present for changed user-facing text;
- [ ] new/changed package entities appear with correct naming and controls;
- [ ] setup/options flow behaves correctly for a fresh config entry;
- [ ] multiple-vehicle behavior is not broken;
- [ ] missing third-party card dependencies produce a clear setup state rather than a broken dashboard.

## 6. Privacy/security review

Before promotion/release:

- [ ] no VIN, account/customer ID, exact location, GPS track, recipient name, credential, token or raw private export was added;
- [ ] public screenshots were visually inspected after opaque redaction;
- [ ] no `.storage` file or private package Store dump is committed;
- [ ] any diagnostic examples use sanitized IDs such as `sensor.<VIN>_kilometer` rather than a real identifier.

## 7. Stable promotion

After exact validation and explicit maintainer/user acceptance:

- [ ] verify `main` is still an ancestor of the exact Validated `develop` SHA;
- [ ] fast-forward `main` to that **same SHA**;
- [ ] do not create a new squash/rebase/cherry-pick commit for promotion;
- [ ] verify `main == develop` at the promotion point;
- [ ] create the tag/GitHub release from the promoted `main` SHA when a release is intended.

## 8. Release notes/documentation

- [ ] update `CHANGELOG.md` for user-facing changes;
- [ ] update README/installation/entity/feature documentation when the contract changed;
- [ ] keep still-open work in GitHub Issues rather than duplicating temporary version-specific runbooks in `docs/`;
- [ ] close or update the operative Issue with Candidate / Runtime / Validated and the final promotion/release SHA.

# Branch and deployment workflow

## Purpose

This repository uses two long-lived branches with deliberately different roles:

- `develop` is the integration and acceptance branch.
- `main` is the last reviewed, accepted and publishable stable state.

The designated Home Assistant household instance may intentionally run an exact
`develop` commit as a canary/acceptance deployment. That does **not** make the
commit a public/stable release.

## Normal change flow

```text
GitHub Issue
  -> ChatGPT prepares implementation on develop
  -> repository/static tests on develop
  -> Candidate = exact develop SHA/version
  -> Codex deploys that exact Candidate to the designated HA acceptance instance
  -> Runtime = exact SHA/version actually served by Home Assistant
  -> browser/app/runtime validation
  -> if a diagnostic patch proved the fix: integrate it into canonical source
  -> build a new Candidate and repeat affected tests
  -> Validated = exact integrated Runtime SHA/version that passed the required checks
  -> Codex reports results in the Issue
  -> ChatGPT reviews findings and prepares follow-up changes on develop if needed
  -> user/maintainer acceptance
  -> fast-forward promotion of that exact Validated SHA to main
  -> tag/release from that exact main SHA
```

## Candidate, Runtime and Validated are different states

Every active deployment Issue must state all three explicitly:

```text
Candidate: <develop SHA> / <version>
Runtime:   <deployed SHA> / <version> | NOT_DEPLOYED
Validated: <accepted SHA> / <version> | NOT_VALIDATED
```

Rules:

1. `Candidate` changes whenever a new intended test commit is prepared on
   `develop`.
2. `Runtime` changes **only** after Codex or another authorized deployment has
   actually copied that exact candidate to Home Assistant and verified the
   served files/version.
3. A newer `develop` HEAD does not silently update the runtime. Until the next
   explicit deployment, Home Assistant continues to run the previous Runtime.
4. `Validated` changes only after the required live/browser/app/user checks
   have passed against the exact Runtime SHA.
5. A failed Runtime remains useful evidence but must never be described as the
   current Candidate once a replacement Candidate exists.
6. Only an exact `Validated` SHA may be promoted to `main`.
7. A diagnostic runtime patch cannot be `Validated` as the final product. The
   proven behavior must first be integrated into canonical source and the
   resulting new Candidate must be redeployed and retested.

This distinction is mandatory in Issue handoffs and prevents the common
ambiguity where a fix exists on `develop` but has not yet reached the live
acceptance instance.

## Patch-to-source integration gate

Temporary patches are sometimes useful during diagnosis, especially for
frontend race conditions, third-party Shadow DOM behavior or a one-off runtime
experiment. They are not an acceptable permanent architecture by default.

Before an Issue can be accepted or promoted:

1. identify what the diagnostic patch actually proved;
2. move that behavior into the canonical module/source path that owns it;
3. remove the temporary post-generation/runtime patch path;
4. bump the frontend candidate version when browser caching is affected;
5. rerun repository tests;
6. deploy the new integrated Candidate;
7. repeat the relevant HA/browser/app/user acceptance checks.

For package frontend architecture, prefer exactly one registered e-C3 Lovelace
entry resource. The entry may import package-owned ES modules, but Home
Assistant should not have to race multiple e-C3 resource registrations or rely
on their incidental execution order.

A narrowly scoped compatibility shim for a third-party component is the only
exception. Such a shim must be necessary because the third-party public API/CSS
contract cannot express the behavior, must opt in only e-C3-owned instances,
must live in canonical source, and must have explicit regression coverage. It
must not become a container for unrelated LIVE/dashboard feature patches.

## Invariants

1. Feature, fix, documentation, test and version changes are made on `develop`.
2. `main` must not receive an independent feature/fix commit.
3. Before a stable promotion, `main` must be an ancestor of the validated
   `develop` SHA. If it is not, stop and reconcile the branches first.
4. Promotion to `main` is **fast-forward only** to the exact SHA that was
   accepted in Home Assistant. Do not squash, rebase or cherry-pick the
   validated change set during promotion; those operations create a different
   commit and break traceability.
5. A stable tag/release is created from the promoted `main` SHA, never from an
   unvalidated `develop` head.
6. After promotion, new development continues from the same history. At the
   promotion point `main` and `develop` should therefore be identical; later
   `develop` may only be ahead, never independently diverged.
7. Emergency fixes follow the same path: fix on `develop`, perform the smallest
   safe runtime validation, then fast-forward `main`. There is no direct-main
   hotfix lane.

## Versioning and browser cache

The integration manifest version and `FRONTEND_VERSION` are maintained on
`develop` as part of the candidate change. A frontend behavior change must bump
`FRONTEND_VERSION` so Home Assistant updates the versioned Lovelace resources.
The release does not add a separate code-only version bump on `main`; any final
version adjustment is committed and validated on `develop` before promotion.

## Runtime deployment contract

Codex must record the exact source SHA before deployment. A result report should
include at least:

```text
repository: CaneTLOTW/e_c3_dashboard
source branch: develop
Candidate SHA/version: <sha> / <version>
Runtime SHA/version before deploy: <sha> / <version>
Runtime SHA/version after deploy: <sha> / <version>
served frontend version: <version>
HA deployment/restart: PASS|FAIL
browser light/dark: PASS|FAIL|NOT_TESTED
HA app light/dark: PASS|FAIL|NOT_TESTED
Validated SHA/version: <sha> / <version> | NOT_VALIDATED
issue acceptance: PASS|FAIL|BLOCKED
```

The Runtime SHA/version must be established from the actual deployed files and
served versioned Lovelace resources, not inferred from the current GitHub
`develop` HEAD.

A runtime copy with local modifications is not a new source of truth. If a
runtime-only fix is unavoidable, Codex must immediately report the diff in the
Issue and the durable fix must be committed back to `develop` before any stable
promotion.

## GitHub Issue handoff

The Issue remains the operative work thread. Use:

```md
## ChatGPT -> Codex Handoff
## Codex -> ChatGPT Ergebnis
## ChatGPT Review / Next Step
```

The handoff references the exact Candidate SHA/version and separately records
what the runtime is believed to be running. The Codex result replaces that
belief with the actually deployed Runtime SHA/version. A later promotion comment
records the exact Validated/stable SHA and release/tag.

## Prohibited branch operations

Unless a dedicated branch-recovery task explicitly requires them:

- no direct feature/fix commits on `main`;
- no cherry-picking the same fix independently to both long-lived branches;
- no squash/rebase between acceptance and stable promotion;
- no force-pushing either long-lived branch;
- no blind `main -> develop` or `develop -> main` content merge to resolve a
  semantic conflict;
- no release from a commit that was not the accepted runtime candidate.

## Branch health check

Before beginning or closing substantial work, verify:

```text
main ancestor of develop: YES
main-only functional commits: 0
develop status: equal to main OR ahead of main
```

If `main` and `develop` report `diverged`, create/reuse a maintenance Issue and
resolve the divergence before the next release.

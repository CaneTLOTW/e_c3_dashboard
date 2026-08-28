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
  -> Codex deploys the exact develop SHA to the designated HA acceptance instance
  -> browser/app/runtime validation
  -> Codex reports results in the Issue
  -> ChatGPT reviews findings and prepares follow-up changes on develop if needed
  -> user/maintainer acceptance
  -> fast-forward promotion of that exact validated SHA to main
  -> tag/release from that exact main SHA
```

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
source SHA: <sha>
manifest version: <version>
frontend version: <version>
HA deployment/restart: PASS|FAIL
browser light/dark: PASS|FAIL|NOT_TESTED
HA app light/dark: PASS|FAIL|NOT_TESTED
issue acceptance: PASS|FAIL|BLOCKED
```

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

The handoff references the exact `develop` SHA. The Codex result references the
actually deployed SHA. A later promotion comment records the exact stable SHA
and release/tag.

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

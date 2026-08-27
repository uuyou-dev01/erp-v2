# ERP v0.9.0 acceptance report

Status: **release candidate verified locally; not accepted for UAT or production**
Release candidate: `0.9.0-rc.1`
Review time: 2026-08-28 01:44 CST (Asia/Shanghai)

The application release candidate now has a reproducible isolated test baseline,
but production data recovery, the final container runtime, the missing screenshot
scenarios, the resource gate and the actual Alibaba Cloud environment remain
release blockers. The contaminated local `erp` database was not used.

## Environment identity

| Field | Value |
|---|---|
| Baseline Git SHA | `12d4242cbe226cacd9dc179282aec9a75dcaaccc` |
| Release implementation SHA | pending release commit |
| Image tag/digest | blocked: Docker Hub unavailable during local build |
| PostgreSQL version | 17.2 |
| Primary E2E database | `erp_v090_root_e2e` |
| Additional isolated runs | `erp_v090_flow_e2e`, `erp_v090_collab_e2e`, `erp_v090_migrate_test` |
| Test mode | production build/start, Chromium, one worker, synthetic identities |

## Automated gates

- [x] Clean local `npm ci` from the lockfile
- [ ] Clean `npm ci` inside the final container image (Docker Hub network blocked)
- [x] Typecheck
- [x] Unit/application integration tests: 121 files / 495 tests
- [x] Production build with Next.js 15.5.21
- [x] Empty PostgreSQL 17 migration deployment: 59 migrations from zero
- [x] Production dependency audit: 0 vulnerabilities
- [x] Weak/missing production secret startup exits with code 1 and leaves the port closed
- [x] Complete current Playwright suite: 36/36, serial, isolated database
- [ ] User backup restore and retention apply/restore drill
- [ ] Final container Chromium and Tesseract Chinese/Japanese/English verification
- [ ] Ten sessions plus one OCR/scrape resource test

Detailed command evidence is under `db-assertions/`.

## Screenshot scenarios

Every image currently present was opened by the primary reviewer in 12 labelled
contact sheets. `pass` means the required current UI evidence exists; `partial`
does not satisfy the release gate.

| # | Scenario | Result | Reviewer notes |
|---:|---|---|---|
| 1 | Login, invitation, revoke/expire, password reset | pass | 11 current screenshots; invite/reset tokens redacted; old session rejected |
| 2 | Multi-organization/store switching and URL isolation | pending | automated authorization coverage exists, but current screenshot matrix is missing |
| 3 | Role menus and direct-URL authorization | pending | current role-by-role screenshots are missing |
| 4 | Member scope change and deactivation | pending | current before/after/counterparty screenshots are missing |
| 5 | Organization connection full lifecycle | pass | 9 screenshots cover request, accept, end, reject, reconnect and notifications |
| 6 | Service agreement confirmation/revision/snapshot | pass | 11 screenshots plus DB assertions cover v1/v2 immutable history |
| 7 | Public/directed offer visibility and cost privacy | pending | publishing is automated, but A/B/C visibility screenshots are missing |
| 8 | Shared inventory reservation, oversell and item identity | pending | application tests pass; six-order UI screenshot sequence is missing |
| 9 | Internal task assignment through completion | partial | assignment and assignee notification shown; completion/result sequence missing |
| 10 | External warehouse invitation/claim/return/transfer | pending | current multi-actor screenshot sequence is missing |
| 11 | Fulfillment request, assignee shipping and denial | pending | current multi-actor screenshot sequence is missing |
| 12 | Purchase through sale and shipment | pass | 15 purchase-to-profit screenshots plus isolated E2E assertions |
| 13 | Offer through settlement, wallet and reporting | pending | full UI transaction chain screenshots are missing |
| 14 | FX boundaries and idempotency | pending | automated coverage exists; the four FX states and repeat-click UI evidence are missing |
| 15 | Notification recipient/context/deep-link/outbox matrix | partial | account, connection, agreement and task evidence exists; full event matrix is missing |
| 16 | OCR, scraping, public/private files, mobile and push | partial | local OCR/mobile E2E passes and routes render; final container/private-object evidence missing |
| 17 | Guessed IDs and revoked-access attempts | partial | revoked invitation and old session shown; guessed-object and tenant revocation screenshots missing |
| 18 | All production routes desktop/mobile smoke | pass | 46 desktop + 11 mobile screenshots; no runtime overlays or blank failures |

## Defects and blockers

| ID | Severity | Area | Status | Evidence / resolution |
|---|---|---|---|---|
| AUTH-01 | P0 | invited registration field binding | fixed/retested | scenario 1 screenshots and isolated E2E |
| DB-INC-01 | P0 | local `erp` was reset by the old Playwright seed | contained | database frozen; only a user backup may become the production source |
| BUILD-01 | P0 | build-time secret validation requested production secrets | fixed/retested | validation now runs in Node instrumentation at startup; production build passes |
| DATA-01 | P0 | recent user backup not supplied | blocked | recovery, manifest, cleanup and restore drill cannot start |
| CONTAINER-01 | P0 | Docker Hub authentication endpoint timed out | blocked | final image and OCR/Chromium runtime are unverified |
| EVIDENCE-01 | P1 | scenarios 2–4, 7–11, 13–17 incomplete | open | must add and review current screenshot evidence |
| LOAD-01 | P1 | 10 sessions + OCR/scrape not executed | open | run on final image in the target 2C4G profile |
| ECS-01 | P0 | server/domain access details not supplied | blocked | Alibaba Cloud preflight/UAT/deployment cannot start |

## Final decision

- [x] Primary reviewer inspected all 107 current screenshots.
- [x] Current automated database assertions were reviewed, not only their exit status.
- [x] Current business flows do not continue through direct DB writes after UI start; setup and negative clock fixtures are documented exceptions.
- [x] No real password, token or private address was observed in the evidence.
- [ ] Accepted for UAT.
- [ ] Accepted for production.

Primary reviewer: Codex main agent
Decision: **hold at `0.9.0-rc.1`; do not tag `v0.9.0` and do not deploy production**

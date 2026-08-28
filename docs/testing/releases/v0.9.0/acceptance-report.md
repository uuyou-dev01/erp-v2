# ERP v0.9.0 acceptance report

Status: **release candidate verified locally; not accepted for UAT or production**
Release candidate: `0.9.0-rc.1`
Review time: 2026-08-28 12:40 CST (Asia/Shanghai)

The application release candidate now has a reproducible isolated test baseline
and a completed current UI screenshot review. Production data recovery, the final
container runtime, the resource gate and the actual Alibaba Cloud environment
remain release blockers. The contaminated local `erp` database was not used.

## Environment identity

| Field                      | Value                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline Git SHA           | `12d4242cbe226cacd9dc179282aec9a75dcaaccc`                                                                                                                 |
| Release implementation SHA | pending release commit                                                                                                                                     |
| Image tag/digest           | blocked: Docker Hub unavailable during local build                                                                                                         |
| PostgreSQL version         | 17.2                                                                                                                                                       |
| Primary E2E database       | `erp_v090_root_rc2_e2e`                                                                                                                                    |
| Additional isolated runs   | `erp_v090_flow_e2e`, `erp_v090_collab_e2e`, `erp_v090_tasks_e2e`, `erp_v090_deploy_e2e`, `erp_v090_notify_e2e`, `erp_v090_ux_e2e`, `erp_v090_migrate_test` |
| Test mode                  | production build/start, Chromium, one worker, synthetic identities                                                                                         |

## Automated gates

- [x] Clean local `npm ci` from the lockfile
- [ ] Clean `npm ci` inside the final container image (Docker Hub network blocked)
- [x] Typecheck
- [x] Unit/application integration tests: 122 files / 503 tests
- [x] Production build with Next.js 15.5.21
- [x] Empty PostgreSQL 17 migration deployment: 60 migrations from zero
- [x] Production dependency audit: 0 vulnerabilities
- [x] Weak/missing production secret startup exits with code 1 and leaves the port closed
- [x] Complete current Playwright suite: 54/54 in 2.6 minutes, serial, isolated database
- [x] Final mobile/cross-device regression: 18/18 in 2.2 minutes on a fresh isolated database
- [ ] User backup restore and retention apply/restore drill
- [ ] Final container Chromium and Tesseract Chinese/Japanese/English verification
- [ ] Ten sessions plus one OCR/scrape resource test

Detailed command evidence is under `db-assertions/`; the current consolidated gate
record is `db-assertions/final-root-validation-rc2.md`.

## Screenshot scenarios

Every canonical image currently present was opened by the primary reviewer in 20
current labelled contact sheets. The 16 current product-audit after-images and six
independent browser-review images were also opened individually. `pass` means the
required current UI evidence exists; `partial` does not satisfy the release gate.

|   # | Scenario                                                 | Result  | Reviewer notes                                                                                                                                                                                                                     |
| --: | -------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Login, invitation, revoke/expire, password reset         | pass    | 11 current screenshots; invite/reset tokens redacted; old session rejected                                                                                                                                                         |
|   2 | Multi-organization/store switching and URL isolation     | pass    | 5 screenshots cover initial scope, store switch, refresh persistence, second organization and cross-organization 404                                                                                                               |
|   3 | Role menus and direct-URL authorization                  | pass    | 10 screenshots cover OWNER/ADMIN/FINANCE/PROCUREMENT/WAREHOUSE/FULFILLMENT menus and four direct-URL denials                                                                                                                       |
|   4 | Member scope change and deactivation                     | pass    | 8 screenshots cover both actors before/after, removed-store denial, deactivation and preservation of the other organization                                                                                                        |
|   5 | Organization connection full lifecycle                   | pass    | 9 screenshots cover request, accept, end, reject, reconnect and notifications                                                                                                                                                      |
|   6 | Service agreement confirmation/revision/snapshot         | pass    | 11 screenshots plus DB assertions cover v1/v2 immutable history                                                                                                                                                                    |
|   7 | Public/directed offer visibility and cost privacy        | pass    | 10 A/B/C screenshots show public visibility, delist, B-only visibility, hidden cost and C denial                                                                                                                                   |
|   8 | Shared inventory reservation, oversell and item identity | pass    | 10 screenshots plus DB reads show five reservations, disabled sixth order, cancellation release and exact-item non-substitution                                                                                                    |
|   9 | Internal task assignment through completion              | pass    | 9 current screenshots cover owner assignment, assignee notification, explicit start, UI completion, assignee receipt, owner result notification and counterparty receipt; DB reads confirm one MEMBER work record                  |
|  10 | External warehouse invitation/claim/return/transfer      | pass    | 18 screenshots cover invitation scope, address privacy, one-winner claim, return, external A→B handoff with prior-user revocation, and owner withdrawal of an in-progress task with executor access revoked                        |
|  11 | Fulfillment request, assignee shipping and denial        | pass    | 9 screenshots show requester creation, provider acceptance, same-provider non-assignee denial, assignee shipment and requester view; DB reads confirm assignment, consumed reservation and shipped allocation                      |
|  12 | Purchase through sale and shipment                       | pass    | 15 purchase-to-profit screenshots plus isolated E2E assertions                                                                                                                                                                     |
|  13 | Offer through settlement, wallet and reporting           | pass    | 14 screenshots show the three-organization chain through both paid settlements, reseller and assignee wallets, workload and reports; DB reads confirm MARGIN informational commission, two paid settlements and one work record    |
|  14 | FX boundaries and idempotency                            | pass    | 8 screenshots cover valid, missing, future-only and expired rates; DB tests additionally prove concurrent replay with the same server idempotency key creates one resale listing                                                   |
|  15 | Notification recipient/context/deep-link/outbox matrix   | pass    | 7 RC2 screenshots plus DB reads cover exact admin recipient, ordinary-member exclusion, active enterprise switch, mark-read, handled reconciliation, dedupe and five skipped outbox rows; scenarios 9/10 retain task notifications |
|  16 | OCR, scraping, public/private files, mobile and push     | partial | mobile task, Chinese UI OCR, Japanese/English worker OCR, public product HTTP preview and Push-unconfigured UI are locally verified; final-container runtime and real Push delivery remain blocked                                 |
|  17 | Guessed IDs and revoked-access attempts                  | partial | prior asset/task denials plus RC2 connection-end offer denial and member-deactivation item denial are verified; broader object-family sampling remains incomplete                                                                  |
|  18 | All production routes desktop/mobile smoke               | pass    | 46 desktop + 11 mobile screenshots; no runtime overlays or blank failures                                                                                                                                                          |

## Defects and blockers

| ID             | Severity | Area                                                                                 | Status         | Evidence / resolution                                                                                                                           |
| -------------- | -------- | ------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-01        | P0       | invited registration field binding                                                   | fixed/retested | scenario 1 screenshots and isolated E2E                                                                                                         |
| DB-INC-01      | P0       | local `erp` was reset by the old Playwright seed                                     | contained      | database frozen; only a user backup may become the production source                                                                            |
| BUILD-01       | P0       | build-time secret validation requested production secrets                            | fixed/retested | validation now runs in Node instrumentation at startup; production build passes                                                                 |
| TENANT-01      | P0       | active organization B could read organization A item through mirrored pool access    | fixed/retested | scenarios 2/4 now require the active organization for a user's own memberships while preserving explicit external warehouse grants              |
| MONEY-01       | P0       | MARGIN agreement produced zero reseller commission and could reduce supplier payable | fixed/retested | scenario 13 pays supplier CNY 120, credits reseller CNY 60 informational commission and posts each wallet ledger exactly once                   |
| DATA-01        | P0       | recent user backup not supplied                                                      | blocked        | recovery, manifest, cleanup and restore drill cannot start                                                                                      |
| CONTAINER-01   | P0       | Docker Hub authentication endpoint timed out                                         | blocked        | final image and OCR/Chromium runtime are unverified                                                                                             |
| EVIDENCE-01    | P1       | scenarios 16–17 incomplete                                                           | open           | scenario 15 notification matrix is complete; final-container OCR/Chromium, real Push delivery and broader object-family revocation paths remain |
| IDEMPOTENCY-01 | P1       | resale-listing create lacked a server idempotency key/unique replay guard            | fixed/retested | unique organization/key constraint, client UUID, prelookup and P2002 race recovery; concurrent same-key test creates one row                    |
| NAV-01         | P1       | external warehouse login discarded the requested task query                          | fixed/retested | login now preserves the exact `/collaboration/tasks?task=<id>` destination; final scenario 10 and full suite pass                               |
| LOAD-01        | P1       | 10 sessions + OCR/scrape not executed                                                | open           | run on final image in the target 2C4G profile                                                                                                   |
| ECS-01         | P0       | server/domain access details not supplied                                            | blocked        | Alibaba Cloud preflight/UAT/deployment cannot start                                                                                             |

## Final decision

- [x] Primary reviewer inspected all 232 canonical screenshots through 20 current labelled contact sheets, plus 16 current product-audit after-images, 6 independent browser-review images and 8 final mobile-linkage images individually (262 current evidence images; 16 before-images retained for comparison).
- [x] Current automated database assertions were reviewed, not only their exit status.
- [x] Current business flows do not continue through direct DB writes after UI start; setup and negative clock fixtures are documented exceptions.
- [x] No real password, token or private address was observed in the evidence.
- [ ] Accepted for UAT.
- [ ] Accepted for production.

Primary reviewer: Codex main agent
Decision: **hold at `0.9.0-rc.1`; do not tag `v0.9.0` and do not deploy production**

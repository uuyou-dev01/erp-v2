# Final root validation — RC2 verification pass

Date: 2026-08-28 (Asia/Shanghai)

Scope: current `0.9.0-rc.1` release worktree after the remaining flow, navigation,
product UX and server-idempotency fixes.

## Isolation

- Primary database: `erp_v090_root_rc2_e2e`
- Product audit database: `erp_v090_ux_e2e`
- Runtime: production `next build` + `next start`, Chromium, `workers=1`
- The contaminated local `erp` database was not connected to, reset, seeded or used as a source.
- Test setup rejected non-`_test`/`_e2e` database names and did not run the general demo seed or `db push`.

## Final gates

| Gate                          | Result | Evidence                                           |
| ----------------------------- | ------ | -------------------------------------------------- |
| Empty PostgreSQL 17 migration | pass   | all 60 checked-in migrations applied from zero     |
| TypeScript                    | pass   | `npm run typecheck`                                |
| Unit/application tests        | pass   | 122 files / 503 tests                              |
| Production build              | pass   | Next.js 15.5.21 build completed                    |
| Full Playwright suite         | pass   | 54/54 in 2.6 minutes, production start, one worker |
| Product UX audit              | pass   | 7/7 in 41.0 seconds                                |
| Production dependency audit   | pass   | official npm registry, 0 vulnerabilities           |
| Diff whitespace check         | pass   | `git diff --check`                                 |

The first full Playwright attempt exposed one real navigation defect: an external
warehouse user was redirected to the general collaboration page after login and
lost the requested `?task=<id>` destination. The login action now preserves that
exact allowed destination. Two other failures were stale assertions expecting the
old English framework 404; they were updated to assert the current Chinese,
non-disclosing recovery page. The complete suite then passed from the beginning.

## Idempotency

`ResaleListing` now carries an organization-scoped unique idempotency key. The
create action performs a prelookup and recovers the matching record after a P2002
race. The browser supplies a stable UUID for a submission, and a concurrent
same-key test proves two requests resolve to one row. This closes the earlier gap
where only a UI double-click had been exercised.

## Visual review

- Canonical release screenshots: 232/232 reviewed through the 20 current labelled
  sheets in `../traces/review-contact-sheets/`.
- Product audit current-state screenshots: 16/16 after-images reviewed individually.
- Primary independent browser review: 6/6 images reviewed individually.
- Total current-state evidence reviewed: 254 images. The 16 before-images remain
  comparison evidence only.
- No Runtime Error overlay, blank failed route, real password, token or private
  address was observed.

## Remaining release blockers

This local verification does not approve UAT or production. The following remain:

- user PostgreSQL backup validation, recovery, cleanup manifest approval and restore drill;
- final non-root container Chromium and Chinese/Japanese/English OCR execution;
- real Web Push delivery;
- ten concurrent sessions plus one OCR/scrape job on the target 2C4G profile;
- Alibaba Cloud ECS/domain/security-group/proxy/monitoring preflight.

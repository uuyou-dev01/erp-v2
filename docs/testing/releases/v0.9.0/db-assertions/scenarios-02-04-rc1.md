# Scenarios 02–04 isolated RC evidence

Review time: 2026-08-28 02:28 CST (Asia/Shanghai)

## Isolation

- Database: `erp_v090_collab_e2e` only.
- Web port: `3101` only.
- Runtime: Next.js production build/start, Chromium, one worker.
- Setup and cleanup: guarded Playwright fixture reset/setup and suite cleanup only.
- Business flow: UI actions only after fixture setup; no database write was used to continue a scenario.
- The local `erp`, root E2E and recovery databases were not accessed by this run.

## Commands and results

```text
npm run typecheck
PASS

TEST_DATABASE_URL=<erp_v090_collab_e2e URL> \
  npx vitest run tests/application/active-organization-object-access.test.ts
1 file / 4 tests passed

E2E_PORT=3101 TEST_DATABASE_URL=<erp_v090_collab_e2e URL> \
  npx playwright test tests/e2e/rc-multi-account-permissions.spec.ts \
  --project=chrome --workers=1
4/4 passed (auth setup plus scenarios 02, 03 and 04), 41.3 s
```

`git diff --check` and the final `npm run typecheck` both passed.

## Findings and retest

The first negative cross-organization item check exposed a real disclosure: an
account with memberships in both organizations could use its mirrored inventory
pool grant to open the inactive organization's item URL. The access policy now
requires objects belonging to another active membership to match the selected
organization, while preserving explicit grants for an external collaborator who
is not a member of the client organization. Four pure policy tests and the UI 404
evidence cover both sides of that rule.

All 23 final screenshots (`02-*-rc1.png`, `03-*-rc1.png`, `04-*-rc1.png`) were
opened and visually reviewed. They contain no loading placeholder, runtime error,
real credential, token or private address. The two negative item screenshots show
404 pages and no protected item title.

During organization switching, stale in-flight workbench server actions emitted
two `无权访问该店铺` log entries while the old page tree was being discarded. The
visible switch completed, persisted after reload and all assertions passed; this
transient log noise remains a follow-up hardening item rather than hidden evidence.

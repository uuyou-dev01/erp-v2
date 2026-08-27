# Scenarios 10, 16 and 17 isolated RC evidence

Review time: 2026-08-28 (Asia/Shanghai)

## Isolation

- Database: `erp_v090_deploy_e2e` only.
- Web port: `3103` only.
- Runtime: Next.js production build/start, Chromium, one worker.
- Setup: guarded Playwright migration/reset and dedicated E2E fixture; no generic seed or `prisma db push`.
- Business flow: all fixture writes finish before the browser flow starts. Later Prisma calls are read-only assertions.
- The local `erp`, root E2E and recovery databases were not accessed by this run.

## Command

```text
E2E_PORT=3103 TEST_DATABASE_URL=<erp_v090_deploy_e2e URL> \
  npx playwright test tests/e2e/deployment-collaboration-security.spec.ts \
  --project=chrome --workers=1

2/2 passed (auth setup plus the scenario chain), 37.9 s

npx tsc --noEmit
PASS

git diff --check
PASS
```

## Assertions

- The owner invites an external warehouse operator. The invitation UI states
  that the operator receives only this warehouse's shipping tasks and does not
  join the owner's company.
- Recipient name, phone and address are hidden before claim and visible only to
  the successful claimant.
- Two eligible external operators claim concurrently. Exactly one succeeds and
  the loser receives the already-claimed error.
- The invitation creates exactly one `WAREHOUSE_TASK_AVAILABLE` notification
  with `actionUrl=/collaboration/tasks?task=<taskId>`. Claiming resolves it with
  `resolutionCode=TASK_CLAIMED`.
- A JPEG proof is accepted only after actual MIME inspection and is stored as a
  bound private asset. The winner and owner receive HTTP 200 in the correct
  organization context.
- The losing collaborator, a guessed UUID, and the same owner while another
  member organization is active all receive HTTP 404.
- A user whose membership in the asset's organization is suspended receives
  HTTP 404 even when an active warehouse roster entry and active assigned task
  were deliberately left behind.
- After the winner returns the task, the uploader immediately receives HTTP
  404 for the bound proof. Suspending the warehouse roster removes the task and
  continues to return HTTP 404.

## Visual review

Thirteen screenshots were opened individually after the final run:
`10-01-*` through `10-07-*`, `16-01-*`, and `17-00-*` through `17-04-*`.
The invitation URL is masked. The images show synthetic identities and a
synthetic address only; no credential, token, real customer address, loading
placeholder or runtime overlay is visible.

## Remaining coverage

- Scenario 10 transfer-to-another-collaborator is not captured.
- Scenario 15 notification mark-read UI and the full event/deduplication matrix
  are not captured; this run covers one exact deep link, deduplication count and
  automatic resolution only.
- Scenario 16 final-container Chromium/Tesseract verification remains blocked,
  and public/mobile upload paths are covered elsewhere.
- Scenario 17 does not yet exercise every object family or connection-end
  revocation path.

During concurrent local suites, PostgreSQL briefly reported 44 idle clients and
another suite hit Prisma P2037. All clients were later released. Final release
runs must remain serial, use the configured connection cap and verify that no
test server or database clients remain after exit. The final check found port
3103 released and zero `erp_v090_deploy_e2e` connections.

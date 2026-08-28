# Scenarios 09 and 10 — isolated RC assertions

Run time: 2026-08-28 (Asia/Shanghai)

Environment:

- database: `erp_v090_tasks_e2e` only
- server: production build/start on port `3103`
- browser/workers: Chrome, `workers=1`
- fixture writes: synthetic internal member, two external warehouse users, roster,
  customer orders, inventory allocation, task and dispatch records only
- business writes: UI actions only after each scenario begins
- verification: Prisma read-only assertions after the UI flow

Verified scenario 09 facts:

- the owner assigned the existing `CONFIRM_ORDER` task through the mobile UI
- the internal assignee received exactly the linked `TASK_ASSIGNED` notification,
  explicitly started the assigned task, and the notification resolved as `TASK_STARTED`
- the assignee confirmed the order through the mobile UI; task status became `DONE`,
  `startedAt`/`completedAt` were populated, and `assignedToId`/`completedById` both
  remained the assignee
- the owner received the linked informational `TASK_DONE` result notification
- the mobile idempotency request finished as `COMPLETED`
- exactly one work record was produced with relationship `MEMBER`

Verified scenario 10 facts:

- external collaborator A claimed the warehouse task, requested a handoff to the other
  active same-location collaborator, and retained responsibility until acceptance
- collaborator B saw the handoff offer before private recipient details were disclosed,
  accepted it through the UI, then became both task assignee and dispatch claimant
- the handoff request closed as `HANDOFF_ACCEPTED`; the deduped notification used the
  canonical `/collaboration/tasks?task=<id>` deep link and resolved as accepted
- collaborator A could no longer see the task immediately after B accepted
- on a separate in-progress task, the owner supplied a mandatory reason and withdrew it
  through the warehouse workbench
- task, dispatch and parent collaboration request all became `CANCELLED`; no completion
  timestamp was written, the immutable event stream contains `CANCELLED`, and the former
  executor could no longer see the task

Full scenarios 09/10 command result:

```text
npx playwright test tests/e2e/release-scenarios-09-10.spec.ts --project=chrome --workers=1
3 passed (45.7s), including auth setup
```

After visual review rejected a loading-state negative screenshot, scenario 10 was
recaptured with an explicit stable-page wait:

```text
npx playwright test tests/e2e/release-scenarios-09-10.spec.ts --project=chrome --workers=1 --grep "10 external"
2 passed (42.4s), including auth setup
```

No production, recovery or root E2E database was read, reset or written by these runs.

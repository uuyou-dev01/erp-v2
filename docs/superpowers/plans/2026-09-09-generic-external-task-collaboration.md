# Generic External Task Collaboration Implementation Plan

状态：已实施并完成浏览器验收（2026-09-09）

**Goal:** Replace labor-like, shipping-only collaboration language with a generic external task relationship while retaining precise business types inside each task.

**Architecture:** Keep `LocationFulfiller`, existing Prisma relations, migrations, and shipping dispatch behavior as the current location-scoped adapter. Centralize generic product labels in `relationship-foundation.ts`, update only relationship/navigation/empty-state language, and keep order shipment wording where the user is performing an actual shipment operation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma, Vitest, Playwright with system Chrome.

---

### Task 1: Lock the generic language contract

**Files:**

- Create: `tests/application/external-task-collaboration-language.test.ts`
- Modify: `tests/application/relationship-foundation.test.ts`
- Modify: `lib/application/relationship-foundation.ts`

- [x] **Step 1: Write the failing source-language test**

Create a test that reads the invitation page, personal collaboration shell, overview page, task page, relationship overview, invitation panel and collaborator manager. Assert that relationship surfaces do not contain `只需要帮忙发货`, `仓库负责人`, `发货操作员`, `我的发货任务` or a navigation label equal to `发货任务`.

- [x] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run tests/application/external-task-collaboration-language.test.ts
```

Expected: FAIL because the current surfaces still contain all four shipping-only terms.

- [x] **Step 3: Change the central role labels**

Set the product labels to:

```ts
MANAGER: "任务负责人"
OPERATOR: "任务协作者"
BACKUP: "任务协作者（旧角色）"
```

Keep the technical enum values unchanged.

- [x] **Step 4: Update the role unit assertions and verify GREEN for the vocabulary unit**

Run:

```bash
npx vitest run tests/application/relationship-foundation.test.ts
```

Expected: PASS with the generic role labels and unchanged capabilities.

### Task 2: Generalize invitation, navigation and relationship surfaces

**Files:**

- Modify: `app/(auth)/invite/warehouse/[token]/page.tsx`
- Modify: `components/auth/location-fulfiller-invitation-panel.tsx`
- Modify: `components/collaboration/personal-workspace-shell.tsx`
- Modify: `app/collaboration/page.tsx`
- Modify: `app/collaboration/tasks/page.tsx`
- Modify: `app/collaboration/tasks/loading.tsx`
- Modify: `components/collaboration/relationship-overview.tsx`
- Modify: `components/inventory/location-fulfiller-manager.tsx`
- Modify: `app/account/page.tsx`
- Modify: `app/(dashboard)/settings/warehouse-collaboration/page.tsx`

- [x] **Step 1: Replace relationship-level copy**

Use `参与合作方任务`, `外部任务协作`, `我的任务`, `任务负责人`, `任务协作者`, `只参与任务协作` and `结束任务协作`. Mention the warehouse/location only as the current collaboration scope, not as the person’s identity.

- [x] **Step 2: Keep a precise task-type cue**

On the current task page, add a short explanation that concrete cards identify `订单发货` and that future confirmation, stocktake and inspection tasks use the same entrance. Do not rename actual shipment actions such as `确认发货`.

- [x] **Step 3: Run the language contract test**

Run:

```bash
npx vitest run tests/application/external-task-collaboration-language.test.ts
```

Expected: PASS.

### Task 3: Generalize coordinator actions without hiding business meaning

**Files:**

- Modify: `components/collaboration/shipping-task-list.tsx`
- Modify: `app/actions/location-fulfillers.ts`
- Modify: `lib/application/shipping-dispatch-lifecycle.ts`
- Modify: `app/(dashboard)/workbench/page.tsx`
- Modify: `components/layout/sidebar.tsx`
- Test: `tests/application/warehouse-collaboration-workbench-source.test.ts`

- [x] **Step 1: Update relationship and assignment messages**

Use `任务负责人`, `任务协作者`, `新的任务`, `任务已指派` and `外部任务协作`. Keep `订单发货` only in messages whose payload is a shipment order.

- [x] **Step 2: Preserve task actions and privacy rules**

Do not change task status transitions, dispatch scope, customer address gating or shipment completion actions.

- [x] **Step 3: Run collaboration application tests**

Run:

```bash
npx vitest run tests/application/relationship-foundation.test.ts tests/application/location-fulfillment-collaboration.test.ts tests/application/shipping-dispatch-lifecycle.test.ts tests/application/warehouse-collaboration-workbench-source.test.ts
```

Expected: all files pass.

### Task 4: Update foundations and browser evidence

**Files:**

- Modify: `docs/relationship-access-foundation.md`
- Modify: `docs/auth-organization-collaboration.md`
- Modify: `docs/domain.md`
- Modify: `docs/routes.md`
- Modify: `docs/superpowers/plans/2026-09-08-warehouse-relationship-growth-flow.md`
- Modify: `tests/e2e/warehouse-relationship-growth-flow.spec.ts`
- Modify: `docs/testing/releases/v0.9.0/relationship-flow/screenshot-index.md`
- Modify: `docs/testing/releases/v0.9.0/relationship-flow/contact-sheet.html`
- Regenerate: `docs/testing/releases/v0.9.0/relationship-flow/screenshots/*.png`
- Regenerate: `docs/testing/releases/v0.9.0/relationship-flow/contact-sheet.png`

- [x] **Step 1: Update the canonical rule**

Define the relationship as external task collaboration. Explain that the current adapter is location-scoped, while each task keeps a concrete business type.

- [x] **Step 2: Update the E2E assertions**

Assert `参与合作方任务`, `我的任务`, `任务负责人`, `只参与任务协作` and the specific `订单发货` cue. Retain database assertions for no `Membership`, assignment, own ERP, company connection, explicit offer visibility and revocation.

- [x] **Step 3: Run the production browser chain**

Run:

```bash
node /private/tmp/run-erp-relationship-test.mjs npx playwright test tests/e2e/warehouse-relationship-growth-flow.spec.ts --project=chrome --workers=1
```

Expected: auth setup and main journey pass; 16 screenshots are regenerated.

- [x] **Step 4: Run final verification**

Run:

```bash
npm run typecheck
node /private/tmp/run-erp-relationship-test.mjs npm test
npm run build
git diff --check
```

Expected: typecheck, complete Vitest suite, production build and whitespace check all pass.

## 实际验证结果

- 命名契约与相关组件测试：6 个文件、23 条通过。
- TypeScript：通过。
- 完整 Vitest：131 个文件、558 条通过。
- 隔离 PostgreSQL：63 个 migration 应用成功。
- 生产构建浏览器链路：认证准备与主链路 2 条通过。
- 16 张截图已重新生成并人工查看；订单任务卡片明确显示“订单发货”。

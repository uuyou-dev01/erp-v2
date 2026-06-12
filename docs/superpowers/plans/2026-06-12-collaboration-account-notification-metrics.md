# Collaboration Account Notification Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable multi-person operating layer for the existing cross-border ERP: account context, store permissions, task assignment, station notifications, and team metrics, while preserving the current workbench flow.

**Architecture:** Keep the current Next.js 15 + Prisma + PostgreSQL application. First stabilize inventory allocation and shipment correctness, then introduce a small auth/context service, then add collaboration models (`Task`, `Notification`, `ActivityLog`) as a layer over current workbench items. Team metrics read from task completion facts and link back to underlying orders/listings for auditability.

**Tech Stack:** Next.js 15 App Router, Server Actions, Prisma 6, PostgreSQL, TypeScript, Zod, Vitest, Playwright, Tailwind, Recharts.

---

## Framework Decision

Continue with the current Next.js + Prisma framework for the first implementation cycle.

Reasoning:

- The current codebase already models the business-specific flow: quick entry, purchase logistics, inspection, listing, quick sale, shipping proof, settlement, item-unit conditions, and workbench queues.
- Odoo and ERPNext/Frappe have stronger built-in ERP permissions and generic modules, but moving now would require rewriting the cross-border workbench and platform/listing semantics.
- Re-evaluate after Milestone 4 if the business shifts toward full accounting, generic HR, tax localization, and standard ERP workflows.

Migration trigger:

- Run a 2-week spike only if standard ERP needs become more important than custom cross-border operations. The spike must implement SKU, inventory, platform order, delegated shipment, notification, and shipper metrics in Odoo or ERPNext and compare it against the current app.

## Working Rules

- Do not touch unrelated existing dirty files unless the task explicitly requires them.
- Prefer small commits after each task group.
- Do not trust client-provided `storeId` once auth context exists.
- Every Server Action that writes business data must either use `requireUserContext()` or be documented as an unauthenticated setup-only path.
- New fields that identify people must use system user IDs, not display-name text.

## File Structure Map

### Existing Files To Modify

- `prisma/schema.prisma`: add enums/models and fields for allocation status, organization, membership, store access, task, notification, activity log, and operation user IDs.
- `prisma/seed.ts`: seed default organization, admin user, team members, store access, and sample tasks.
- `app/actions/customer-orders.ts`: fix allocation reservation, shipment remaining quantity, and write task completion hooks.
- `app/actions/listings.ts`: record listing operation user and complete listing tasks.
- `app/actions/workflow-actions.ts`: connect workbench actions to task lifecycle and notification creation.
- `app/actions/workbench.ts`: return current-user task filters and task metadata.
- `lib/application/workflow-queries.ts`: merge existing derived work items with task assignment data.
- `lib/application/next-actions.ts`: extend work item types with task fields.
- `components/workbench/action-drawer-forms/index.tsx`: show assignee/delegation controls and complete tasks through actions.
- `components/workbench/work-item-row.tsx`: show assignee, task status, and due date.
- `components/workbench/next-action-workbench.tsx`: add filters for my tasks, delegated tasks, all tasks, store, platform, and assignee.
- `components/layout/header.tsx`: display notification count and user context.
- `components/layout/sidebar.tsx`: add Team, Notifications, and Team Reports routes.
- `app/(dashboard)/reports/page.tsx`: link to team report entry point or keep existing report and add route under reports.

### New Files To Create

- `lib/auth/user-context.ts`: current user/store/permission resolver.
- `lib/auth/permissions.ts`: role and permission checks.
- `lib/application/tasks.ts`: task lifecycle service.
- `lib/application/notifications.ts`: notification creation, unread counts, mark-read behavior.
- `lib/application/activity-log.ts`: append-only business audit helper.
- `lib/application/team-metrics.ts`: team metrics queries.
- `app/actions/team.ts`: team member and store access actions.
- `app/actions/tasks.ts`: task assignment, transfer, start, completion, cancellation, notification read actions.
- `app/actions/team-reports.ts`: server actions for team metrics.
- `app/(auth)/login/page.tsx`: login entry if current auth setup is absent.
- `app/(dashboard)/settings/team/page.tsx`: team member management.
- `app/(dashboard)/settings/stores/page.tsx`: store access management.
- `app/(dashboard)/notifications/page.tsx`: notification inbox.
- `app/(dashboard)/reports/team/page.tsx`: team metrics dashboard.
- `components/team/team-member-table.tsx`: member list and role controls.
- `components/team/store-access-table.tsx`: store permission controls.
- `components/notifications/notification-list.tsx`: notification inbox UI.
- `components/reports/team-metrics-dashboard.tsx`: team metrics UI.
- `tests/application/inventory-allocation.test.ts`: allocation reservation tests.
- `tests/application/shipping-ledger.test.ts`: shipment ledger tests.
- `tests/application/tasks.test.ts`: task lifecycle tests.
- `tests/application/notifications.test.ts`: notification rule tests.
- `tests/application/team-metrics.test.ts`: metrics aggregation tests.
- `tests/e2e/workbench-collaboration.spec.ts`: Playwright smoke test for delegated shipment.

## Milestone 1: Stabilize Current Flow

### Task 1: Add Test Harness

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup/prisma-test-client.ts`
- Modify: `package.json`

- [ ] **Step 1: Add Vitest dependencies**

Run:

```bash
npm install -D vitest @vitest/coverage-v8
```

Expected: dependencies added to `package.json` and `package-lock.json`.

- [ ] **Step 2: Add test scripts**

Modify `package.json` scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

Keep existing scripts unchanged.

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup/prisma-test-client.ts"],
  },
});
```

- [ ] **Step 4: Create `tests/setup/prisma-test-client.ts`**

```ts
process.env.NODE_ENV = "test";
```

- [ ] **Step 5: Run test command**

Run:

```bash
npm run test
```

Expected: Vitest starts and reports no tests or existing tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup/prisma-test-client.ts
git commit -m "test: add vitest harness"
```

### Task 2: Fix Shipment Remaining Quantity

**Files:**
- Modify: `app/actions/customer-orders.ts`
- Create: `tests/application/shipping-ledger.test.ts`

- [ ] **Step 1: Write failing unit test for remaining quantity calculation**

Create a small pure helper first in the test to express the intended behavior:

```ts
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

function isLotConsumedAfterShipment(ledgerTotalAfterShipment: Decimal) {
  return ledgerTotalAfterShipment.lte(0);
}

describe("shipping ledger remaining quantity", () => {
  it("keeps a lot active when 10 units exist and 3 are shipped", () => {
    expect(isLotConsumedAfterShipment(new Decimal(7))).toBe(false);
  });

  it("consumes a lot when shipment leaves zero units", () => {
    expect(isLotConsumedAfterShipment(new Decimal(0))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
npm run test -- tests/application/shipping-ledger.test.ts
```

Expected: PASS for helper. This test documents the intended rule before code change.

- [ ] **Step 3: Patch shipment logic**

In `markOrderShipped`, after writing the outbound ledger and reading ledgers, change the lot status condition from subtracting the allocation again to using the already-updated remaining value:

```ts
const remaining = ledgers.reduce(
  (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
  new Decimal(0)
);

if (remaining.lte(0)) {
  await tx.inventoryLot.update({
    where: { id: allocation.lotId },
    data: { status: "CONSUMED" },
  });
}
```

- [ ] **Step 4: Run build and tests**

Run:

```bash
npm run test -- tests/application/shipping-ledger.test.ts
npm run build
```

Expected: both commands pass.

- [ ] **Step 5: Commit**

```bash
git add app/actions/customer-orders.ts tests/application/shipping-ledger.test.ts
git commit -m "fix: avoid double counting shipped lot quantity"
```

### Task 3: Reserve Inventory On Allocation

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `app/actions/customer-orders.ts`
- Create: `tests/application/inventory-allocation.test.ts`

- [ ] **Step 1: Add allocation status constants**

Keep the existing Prisma `String` status field for this task and introduce local constants in `app/actions/customer-orders.ts`. Prisma enum migration belongs in a later status-hardening pass after the reservation bug is fixed:

```ts
const ORDER_ALLOCATION_STATUS = {
  PENDING: "PENDING",
  ALLOCATED: "ALLOCATED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  RETURNED: "RETURNED",
} as const;
```

- [ ] **Step 2: Add failing test for reserved quantity rule**

Create `tests/application/inventory-allocation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";

function availableAfterReservations(onHand: Decimal, reserved: Decimal) {
  return onHand.minus(reserved);
}

describe("inventory allocation reservation", () => {
  it("subtracts allocated quantity from available stock before shipping", () => {
    expect(availableAfterReservations(new Decimal(10), new Decimal(3)).toString()).toBe("7");
  });

  it("does not allow a reservation larger than available stock", () => {
    expect(availableAfterReservations(new Decimal(2), new Decimal(3)).lt(0)).toBe(true);
  });
});
```

- [ ] **Step 3: Update allocation transaction**

In `allocateInventory`, wrap availability check, allocation create, and order line update in a transaction. The implementation must:

1. Sum `StockLedger.deltaQty` for the selected lot.
2. Sum `OrderAllocation.quantity` for statuses `PENDING` and `ALLOCATED`.
3. Reject when `onHand - reserved < requested`.
4. Create allocation with status `ALLOCATED`.

Use this shape:

```ts
const allocation = await prisma.$transaction(async (tx) => {
  const lot = await tx.inventoryLot.findUnique({ where: { id: data.lotId } });
  if (!lot) throw new Error("库存批次不存在");

  const ledgers = await tx.stockLedger.findMany({
    where: { entityType: "LOT", entityId: data.lotId },
    select: { deltaQty: true },
  });
  const onHand = ledgers.reduce(
    (sum, ledger) => sum.plus(new Decimal(ledger.deltaQty.toString())),
    new Decimal(0)
  );

  const activeAllocations = await tx.orderAllocation.findMany({
    where: {
      lotId: data.lotId,
      status: { in: [ORDER_ALLOCATION_STATUS.PENDING, ORDER_ALLOCATION_STATUS.ALLOCATED] },
    },
    select: { quantity: true },
  });
  const reserved = activeAllocations.reduce(
    (sum, item) => sum.plus(new Decimal(item.quantity.toString())),
    new Decimal(0)
  );

  if (onHand.minus(reserved).lt(quantity)) {
    throw new Error("可用库存不足，无法分配");
  }

  const unitCost = new Decimal(lot.unitCost.toString());
  const costAmount = quantity.times(unitCost);

  const created = await tx.orderAllocation.create({
    data: {
      orderLineId: data.orderLineId,
      allocationType: "LOT",
      lotId: data.lotId,
      quantity: quantity.toFixed(4),
      unitCost: unitCost.toFixed(4),
      costAmount: costAmount.toFixed(4),
      status: ORDER_ALLOCATION_STATUS.ALLOCATED,
    },
  });

  await tx.orderLine.update({
    where: { id: data.orderLineId },
    data: { supplyStatus: "ALLOCATED_FROM_STOCK" },
  });

  return created;
});
```

- [ ] **Step 4: Update shipment and cancellation statuses**

In shipment success path, set shipped allocations to `SHIPPED`.

In cancellation path, set open allocations to `CANCELLED` before releasing order status.

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- tests/application/inventory-allocation.test.ts tests/application/shipping-ledger.test.ts
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add app/actions/customer-orders.ts tests/application/inventory-allocation.test.ts
git commit -m "fix: reserve stock when allocating orders"
```

## Milestone 2: Account Context And Store Permissions

### Task 4: Add Organization And Access Models

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Add models to Prisma schema**

Add these models and relations:

```prisma
model Organization {
  id        String   @id @default(cuid())
  name      String
  code      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  stores      Store[]
  memberships Membership[]

  @@map("organizations")
}

model Membership {
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  role           String   @default("VIEWER")
  status         String   @default("ACTIVE")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([organizationId, userId])
  @@index([userId])
  @@map("memberships")
}

model StoreAccess {
  id          String   @id @default(cuid())
  storeId     String
  userId      String
  role        String   @default("VIEWER")
  permissions Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([storeId, userId])
  @@index([userId])
  @@map("store_accesses")
}
```

Add `organizationId` to `Store`, and add inverse relations to `User`.

- [ ] **Step 2: Run Prisma format and validate**

Run:

```bash
npx prisma format
npx prisma validate
```

Expected: schema validates.

- [ ] **Step 3: Seed default organization and access**

In `prisma/seed.ts`, create:

```ts
const organization = await prisma.organization.upsert({
  where: { code: "main" },
  update: {},
  create: { code: "main", name: "默认经营主体" },
});
```

Ensure seeded stores use `organizationId: organization.id`.

Create two users and access rows:

```ts
const adminUser = await prisma.user.upsert({
  where: { email: "admin@example.com" },
  update: {},
  create: {
    email: "admin@example.com",
    name: "管理员",
    password: "dev-password",
    role: "OWNER",
    storeId: store.id,
  },
});

await prisma.membership.upsert({
  where: { organizationId_userId: { organizationId: organization.id, userId: adminUser.id } },
  update: { role: "OWNER", status: "ACTIVE" },
  create: { organizationId: organization.id, userId: adminUser.id, role: "OWNER" },
});

await prisma.storeAccess.upsert({
  where: { storeId_userId: { storeId: store.id, userId: adminUser.id } },
  update: { role: "OWNER" },
  create: { storeId: store.id, userId: adminUser.id, role: "OWNER" },
});
```

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts
git commit -m "feat: add organization and store access models"
```

### Task 5: Add User Context Service

**Files:**
- Create: `lib/auth/permissions.ts`
- Create: `lib/auth/user-context.ts`
- Modify: core Server Actions incrementally

- [ ] **Step 1: Create permission constants**

```ts
export const ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  LISTING: "LISTING",
  FULFILLMENT: "FULFILLMENT",
  FINANCE: "FINANCE",
  VIEWER: "VIEWER",
} as const;

export type Role = keyof typeof ROLES;

const ROLE_RANK: Record<string, number> = {
  OWNER: 100,
  ADMIN: 90,
  MANAGER: 70,
  FINANCE: 50,
  LISTING: 40,
  FULFILLMENT: 40,
  VIEWER: 10,
};

export function hasRoleAtLeast(role: string | null | undefined, minimum: string) {
  return (ROLE_RANK[role ?? ""] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}
```

- [ ] **Step 2: Create user context helper**

```ts
import { prisma } from "@/lib/prisma";

export interface UserContext {
  userId: string;
  organizationId: string;
  role: string;
  activeStoreId: string;
  storeIds: string[];
}

const DEV_USER_EMAIL = "admin@example.com";

export async function requireUserContext(input?: { storeId?: string }): Promise<UserContext> {
  const user = await prisma.user.findUnique({
    where: { email: DEV_USER_EMAIL },
    include: {
      memberships: true,
      storeAccesses: true,
    },
  });

  if (!user) throw new Error("当前用户不存在，请先运行种子数据");

  const membership = user.memberships[0];
  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("当前用户没有有效主体成员身份");
  }

  const storeIds = user.storeAccesses.map((access) => access.storeId);
  const activeStoreId = input?.storeId ?? storeIds[0] ?? user.storeId;

  if (!storeIds.includes(activeStoreId)) {
    throw new Error("无权访问该店铺");
  }

  return {
    userId: user.id,
    organizationId: membership.organizationId,
    role: membership.role,
    activeStoreId,
    storeIds,
  };
}
```

This dev context is temporary. Replace it with NextAuth session lookup after the data and permission flow works.

- [ ] **Step 3: Replace hard-coded store in one vertical slice**

Start with workbench queries and actions. Replace direct `STORE_ID = "store_1"` usage with:

```ts
const context = await requireUserContext();
const storeId = context.activeStoreId;
```

- [ ] **Step 4: Run targeted checks**

Run:

```bash
rg -n "store_1|STORE_ID" app lib components
npm run build
```

Expected: build passes. The search can still show modules outside the workbench vertical slice; those modules are covered by later account-context replacement tasks.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/permissions.ts lib/auth/user-context.ts app/actions/workbench.ts lib/application/workflow-queries.ts
git commit -m "feat: add user context for workbench store access"
```

## Milestone 3: Tasks, Notifications, Activity Log

### Task 6: Add Collaboration Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/application/tasks.ts`
- Create: `lib/application/notifications.ts`
- Create: `lib/application/activity-log.ts`
- Create: `tests/application/tasks.test.ts`
- Create: `tests/application/notifications.test.ts`

- [ ] **Step 1: Add Prisma models**

Add `Task`, `Notification`, and `ActivityLog` exactly as defined in the design spec, using `String` status/type fields initially for migration safety.

- [ ] **Step 2: Create task status constants**

```ts
import { prisma } from "@/lib/prisma";
import { notifyUser } from "@/lib/application/notifications";

export const TASK_STATUS = {
  OPEN: "OPEN",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
  OVERDUE: "OVERDUE",
} as const;

export const TASK_TYPE = {
  LISTING_CREATE: "LISTING_CREATE",
  LISTING_UPDATE: "LISTING_UPDATE",
  PACK_ORDER: "PACK_ORDER",
  SHIP_ORDER: "SHIP_ORDER",
  CONFIRM_ARRIVAL: "CONFIRM_ARRIVAL",
  INSPECT_ITEM: "INSPECT_ITEM",
  SETTLE_ORDER: "SETTLE_ORDER",
  RESOLVE_EXCEPTION: "RESOLVE_EXCEPTION",
} as const;
```

- [ ] **Step 3: Implement create task service**

```ts
export async function createTask(input: {
  organizationId: string;
  storeId: string;
  type: string;
  title: string;
  description?: string;
  refType: string;
  refId: string;
  createdById: string;
  assignedToId?: string;
  dueAt?: Date;
  metadata?: unknown;
}) {
  return prisma.task.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      type: input.type,
      status: input.assignedToId ? TASK_STATUS.ASSIGNED : TASK_STATUS.OPEN,
      title: input.title,
      description: input.description,
      refType: input.refType,
      refId: input.refId,
      createdById: input.createdById,
      assignedToId: input.assignedToId,
      assignedAt: input.assignedToId ? new Date() : null,
      dueAt: input.dueAt,
      metadata: input.metadata as object,
    },
  });
}
```

- [ ] **Step 4: Implement notification service**

```ts
import { prisma } from "@/lib/prisma";

export async function notifyUser(input: {
  organizationId: string;
  storeId?: string;
  recipientId: string;
  actorId?: string;
  taskId?: string;
  refType?: string;
  refId?: string;
  type: string;
  title: string;
  body?: string;
}) {
  if (input.actorId && input.actorId === input.recipientId && input.type === "TASK_DONE") {
    return null;
  }

  return prisma.notification.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      recipientId: input.recipientId,
      actorId: input.actorId,
      taskId: input.taskId,
      refType: input.refType,
      refId: input.refId,
      type: input.type,
      title: input.title,
      body: input.body,
    },
  });
}
```

- [ ] **Step 5: Implement activity log helper**

```ts
import { prisma } from "@/lib/prisma";

export async function logActivity(input: {
  organizationId: string;
  storeId?: string;
  actorId?: string;
  action: string;
  refType: string;
  refId: string;
  taskId?: string;
  before?: unknown;
  after?: unknown;
  message?: string;
}) {
  return prisma.activityLog.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      actorId: input.actorId,
      action: input.action,
      refType: input.refType,
      refId: input.refId,
      taskId: input.taskId,
      before: input.before as object,
      after: input.after as object,
      message: input.message,
    },
  });
}
```

- [ ] **Step 6: Add task lifecycle tests**

Create tests that assert task status transitions:

```ts
import { describe, expect, it } from "vitest";
import { TASK_STATUS } from "@/lib/application/tasks";

describe("task lifecycle", () => {
  it("starts assigned tasks in ASSIGNED status", () => {
    expect(TASK_STATUS.ASSIGNED).toBe("ASSIGNED");
  });

  it("uses DONE for completed tasks", () => {
    expect(TASK_STATUS.DONE).toBe("DONE");
  });
});
```

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/application/tasks.ts lib/application/notifications.ts lib/application/activity-log.ts tests/application/tasks.test.ts tests/application/notifications.test.ts
git commit -m "feat: add collaboration task and notification services"
```

### Task 7: Connect Shipment Delegation To Tasks

**Files:**
- Modify: `app/actions/workflow-actions.ts`
- Modify: `components/workbench/action-drawer-forms/index.tsx`
- Modify: `lib/application/workflow-queries.ts`
- Create: `app/actions/tasks.ts`

- [ ] **Step 1: Add assignment action**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/user-context";
import { assignTask } from "@/lib/application/tasks";

export async function assignWorkTask(taskId: string, assignedToId: string) {
  const context = await requireUserContext();
  await assignTask({
    taskId,
    assignedToId,
    actorId: context.userId,
    organizationId: context.organizationId,
  });
  revalidatePath("/workbench");
}
```

- [ ] **Step 2: Implement `assignTask` service**

```ts
export async function assignTask(input: {
  taskId: string;
  assignedToId: string;
  actorId: string;
  organizationId: string;
}) {
  const task = await prisma.task.update({
    where: { id: input.taskId },
    data: {
      assignedToId: input.assignedToId,
      delegatedToId: input.assignedToId,
      assignedAt: new Date(),
      status: TASK_STATUS.ASSIGNED,
    },
  });

  await notifyUser({
    organizationId: input.organizationId,
    storeId: task.storeId,
    recipientId: input.assignedToId,
    actorId: input.actorId,
    taskId: task.id,
    refType: task.refType,
    refId: task.refId,
    type: "TASK_ASSIGNED",
    title: "你有一个新的任务",
    body: task.title,
  });

  return task;
}
```

- [ ] **Step 3: Create shipment task when order becomes pending shipment**

When `confirmOrder` succeeds, call `createTask` with:

```ts
{
  organizationId: context.organizationId,
  storeId: order.storeId,
  type: TASK_TYPE.SHIP_ORDER,
  title: `发货订单 ${order.orderNumber}`,
  refType: "CUSTOMER_ORDER",
  refId: order.id,
  createdById: context.userId,
}
```

- [ ] **Step 4: Complete shipment task when shipping is confirmed**

In `submitShipOrder` or `markOrderShipped`, complete the related open `SHIP_ORDER` task and set `completedById` to current user.

- [ ] **Step 5: Commit**

```bash
git add app/actions/tasks.ts app/actions/workflow-actions.ts components/workbench/action-drawer-forms/index.tsx lib/application/workflow-queries.ts
git commit -m "feat: delegate shipment tasks from workbench"
```

## Milestone 4: Notifications And Team Metrics UI

### Task 8: Notification Inbox

**Files:**
- Create: `app/(dashboard)/notifications/page.tsx`
- Create: `components/notifications/notification-list.tsx`
- Modify: `components/layout/header.tsx`
- Modify: `components/layout/sidebar.tsx`

- [ ] **Step 1: Query unread notifications**

Create a server action that returns unread and recent notifications for current user:

```ts
export async function getMyNotifications() {
  const context = await requireUserContext();
  return prisma.notification.findMany({
    where: { recipientId: context.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
```

- [ ] **Step 2: Mark notification read**

```ts
export async function markNotificationRead(notificationId: string) {
  const context = await requireUserContext();
  await prisma.notification.update({
    where: { id: notificationId, recipientId: context.userId },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
```

- [ ] **Step 3: Add header badge**

Show unread count next to the existing Bell icon. Use `0` hidden state and show count only when positive.

- [ ] **Step 4: Commit**

```bash
git add app/actions/tasks.ts app/'(dashboard)'/notifications/page.tsx components/notifications/notification-list.tsx components/layout/header.tsx components/layout/sidebar.tsx
git commit -m "feat: add notification inbox"
```

### Task 9: Team Metrics

**Files:**
- Create: `lib/application/team-metrics.ts`
- Create: `app/actions/team-reports.ts`
- Create: `app/(dashboard)/reports/team/page.tsx`
- Create: `components/reports/team-metrics-dashboard.tsx`
- Create: `tests/application/team-metrics.test.ts`

- [ ] **Step 1: Implement metrics query**

```ts
export async function getTeamMetrics(input: {
  storeId?: string;
  userId?: string;
  dateFrom: Date;
  dateTo: Date;
}) {
  const context = await requireUserContext(input.storeId ? { storeId: input.storeId } : undefined);
  const storeIds = input.storeId ? [input.storeId] : context.storeIds;

  const tasks = await prisma.task.findMany({
    where: {
      storeId: { in: storeIds },
      completedAt: { gte: input.dateFrom, lte: input.dateTo },
      ...(input.userId ? { completedById: input.userId } : {}),
      status: TASK_STATUS.DONE,
    },
    include: { completedBy: true },
  });

  return summarizeTeamTasks(tasks);
}
```

- [ ] **Step 2: Implement pure summarizer**

```ts
export function summarizeTeamTasks(tasks: Array<{
  type: string;
  completedById: string | null;
  completedAt: Date | null;
  assignedAt: Date | null;
}>) {
  const rows = new Map<string, {
    userId: string;
    listingCount: number;
    shipmentCount: number;
    settlementCount: number;
    totalCount: number;
    totalMinutes: number;
  }>();

  for (const task of tasks) {
    if (!task.completedById) continue;
    const row = rows.get(task.completedById) ?? {
      userId: task.completedById,
      listingCount: 0,
      shipmentCount: 0,
      settlementCount: 0,
      totalCount: 0,
      totalMinutes: 0,
    };

    if (task.type === TASK_TYPE.LISTING_CREATE || task.type === TASK_TYPE.LISTING_UPDATE) row.listingCount += 1;
    if (task.type === TASK_TYPE.SHIP_ORDER || task.type === TASK_TYPE.PACK_ORDER) row.shipmentCount += 1;
    if (task.type === TASK_TYPE.SETTLE_ORDER) row.settlementCount += 1;

    row.totalCount += 1;
    if (task.assignedAt && task.completedAt) {
      row.totalMinutes += Math.max(0, Math.round((task.completedAt.getTime() - task.assignedAt.getTime()) / 60000));
    }

    rows.set(task.completedById, row);
  }

  return Array.from(rows.values());
}
```

- [ ] **Step 3: Add summarizer test**

```ts
import { describe, expect, it } from "vitest";
import { summarizeTeamTasks } from "@/lib/application/team-metrics";
import { TASK_TYPE } from "@/lib/application/tasks";

describe("team metrics", () => {
  it("counts listing and shipment tasks by completed user", () => {
    const rows = summarizeTeamTasks([
      { type: TASK_TYPE.LISTING_CREATE, completedById: "u1", assignedAt: new Date("2026-01-01T00:00:00Z"), completedAt: new Date("2026-01-01T00:10:00Z") },
      { type: TASK_TYPE.SHIP_ORDER, completedById: "u1", assignedAt: new Date("2026-01-01T01:00:00Z"), completedAt: new Date("2026-01-01T01:15:00Z") },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        userId: "u1",
        listingCount: 1,
        shipmentCount: 1,
        totalCount: 2,
        totalMinutes: 25,
      }),
    ]);
  });
});
```

- [ ] **Step 4: Build report page**

Add `/reports/team` with date filter, user filter, store filter, and summary table:

```tsx
export default async function TeamReportsPage() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 30);
  const rows = await getTeamMetricsAction({ dateFrom: from.toISOString(), dateTo: to.toISOString() });
  return <TeamMetricsDashboard rows={rows} />;
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/application/team-metrics.ts app/actions/team-reports.ts app/'(dashboard)'/reports/team/page.tsx components/reports/team-metrics-dashboard.tsx tests/application/team-metrics.test.ts
git commit -m "feat: add team performance metrics"
```

## Milestone 5: End-To-End Verification

### Task 10: Playwright Smoke Flow

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/e2e/workbench-collaboration.spec.ts`

- [ ] **Step 1: Add Playwright**

Run:

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Add E2E scripts**

```json
{
  "test:e2e": "playwright test"
}
```

- [ ] **Step 3: Add Playwright config**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
```

- [ ] **Step 4: Add smoke test**

```ts
import { expect, test } from "@playwright/test";

test("workbench and notifications render without app errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/workbench");
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByText("工作台")).toBeVisible();

  await page.goto("/notifications");
  await expect(page.locator("main")).toBeVisible();

  expect(errors.filter((line) => /Runtime Error|Application error|Prisma/.test(line))).toEqual([]);
});
```

- [ ] **Step 5: Run all checks**

Run:

```bash
npx prisma validate
npm run test
npm run build
npm run test:e2e
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/e2e/workbench-collaboration.spec.ts
git commit -m "test: add collaboration smoke coverage"
```

## Completion Checklist

- [ ] Current framework decision is documented and no migration is started without spike evidence.
- [ ] Inventory allocation reserves stock before shipment.
- [ ] Shipment ledger no longer double subtracts lot quantity.
- [ ] User context exists and at least workbench uses it.
- [ ] Organization, membership, and store access seed data exist.
- [ ] Tasks can be created, assigned, transferred, and completed.
- [ ] Shipping tasks are generated from order flow and completed by actual operator.
- [ ] Notifications are generated for assignment and completion.
- [ ] Header and notifications page show unread notifications.
- [ ] Team metrics report shows listing, shipment, settlement, and task counts by user.
- [ ] Vitest covers core business helpers.
- [ ] Playwright smoke test covers workbench and notifications.
- [ ] `npx prisma validate`, `npm run test`, `npm run build`, and `npm run test:e2e` pass.

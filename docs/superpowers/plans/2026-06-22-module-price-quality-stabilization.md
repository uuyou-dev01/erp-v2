# ERP Module, Price, and Quality Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the ERP around daily business modules, make price/profit calculations explicit and testable, and establish a systematic bug/usability detection loop.

**Architecture:** Keep existing database models and URLs stable first, then change navigation, page boundaries, pricing services, and report/query contracts in small verified steps. Treat `StockLedger` and `OrderAllocation` as the inventory/cost truth source, while `Listing` remains a platform exposure record and reports consume computed financial summaries.

**Tech Stack:** Next.js App Router, React 19, Prisma, PostgreSQL, Decimal.js, Vitest, Playwright, TypeScript.

---

## Current Evidence

- `npx tsc --noEmit` passes.
- `npm test` passes: 9 files, 27 tests.
- `npm run build` passes but reports lint/a11y warnings:
  - `app/(dashboard)/inventory/items/[id]/page.tsx`: missing `alt` on image.
  - `app/actions/workflow-actions.ts`: unused `resolvePlatformId`.
  - `lib/application/next-actions.ts`: unused `selectedQueue`.
  - `lib/fx.ts`: unused `storeId`.
  - `lib/platform-icons.ts`: unused `ICON_BASE`.
  - Several `<img>` optimization warnings are lower priority.
- Existing E2E coverage only smoke-tests collaboration pages and navigation; it does not cover purchase -> inventory -> listing -> order -> profit.
- Current pricing core is `lib/application/order-fees.ts`, but it only computes order-level net revenue. It does not expose order-line fee allocation or a reusable profit summary contract.

## Files and Responsibilities

- Modify `config/navigation.ts`: reorganize visible navigation into fewer daily modules while preserving existing route URLs.
- Modify `docs/routes.md`: document the new module grouping and compatibility policy.
- Modify `docs/domain.md`: add a short product-rule section for the five core ERP questions and current exclusions.
- Modify `lib/application/order-fees.ts`: extend pricing utilities with line-level allocation and profit summaries.
- Create `tests/application/order-fees.test.ts`: lock down fee parsing, proportional allocation, rounding, and profit calculation.
- Modify `app/actions/reports.ts`: consume the pricing helpers where report-level profit or net revenue is computed.
- Modify `tests/application/navigation.test.ts`: update expected navigation grouping and settings placement.
- Create `tests/e2e/core-flow-smoke.spec.ts`: browser smoke coverage for the main route groups and page runtime errors.
- Modify warning files only where the fix is small and low-risk:
  - `app/(dashboard)/inventory/items/[id]/page.tsx`
  - `app/actions/workflow-actions.ts`
  - `lib/application/next-actions.ts`
  - `lib/fx.ts`
  - `lib/platform-icons.ts`

## Explicit Non-Goals For This Iteration

- Do not implement shuttle bus plans, target weights, loading deadlines, or "Wednesday bus still needs X kg".
- Do not make missing SKU weight block profit calculation.
- Do not change database schema unless a later implementation task proves it is required.
- Do not remove existing routes; use redirects or hidden navigation instead.
- Do not redesign the full visual UI before the business boundaries are stable.

---

### Task 1: Quality Baseline and Warning Cleanup

**Files:**
- Modify: `app/(dashboard)/inventory/items/[id]/page.tsx`
- Modify: `app/actions/workflow-actions.ts`
- Modify: `lib/application/next-actions.ts`
- Modify: `lib/fx.ts`
- Modify: `lib/platform-icons.ts`

- [ ] **Step 1: Re-run the current baseline**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected:

```text
tsc exits 0
vitest exits 0
next build exits 0 with the same warnings listed in Current Evidence
```

- [ ] **Step 2: Fix the missing image alt**

In `app/(dashboard)/inventory/items/[id]/page.tsx`, locate the image around the build warning line and ensure it has a meaningful alt derived from the item/SKU display name. If the image is decorative, use `alt=""`; otherwise use the product name.

Example shape:

```tsx
<img
  src={photoUrl}
  alt={`${item.sku.code} ${item.sku.name}`}
  className="..."
/>
```

- [ ] **Step 3: Remove or prefix unused variables**

For unused values that are intentional parameters, rename them with a leading underscore. For dead constants/functions, remove them.

Expected edits:

```ts
// lib/application/next-actions.ts
export function countWorkItems(items: WorkItem[], _selectedQueue?: WorkQueue): QueueCounts {
  ...
}
```

```ts
// lib/fx.ts
export async function createStoreMoneyConverter(_storeId: string) {
  ...
}
```

For `resolvePlatformId` and `ICON_BASE`, delete them if no call sites exist:

```bash
rg "resolvePlatformId|ICON_BASE" app lib components
```

Expected: only the definition remains before deletion.

- [ ] **Step 4: Re-run verification**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected:

```text
tsc exits 0
vitest exits 0
next build exits 0
missing alt and unused-variable warnings are gone
```

- [ ] **Step 5: Commit**

```bash
git add app lib tests
git commit -m "chore: clean baseline build warnings"
```

---

### Task 2: Navigation Module Reorganization

**Files:**
- Modify: `config/navigation.ts`
- Modify: `docs/routes.md`
- Modify: `docs/domain.md`
- Modify: `tests/application/navigation.test.ts`

- [ ] **Step 1: Write/update navigation tests first**

In `tests/application/navigation.test.ts`, assert these primary groups and placements:

```ts
import { describe, expect, it } from "vitest";
import { operationsNavigation, settingsNavigation } from "@/config/navigation";

describe("navigation module grouping", () => {
  it("keeps daily operation modules focused", () => {
    expect(operationsNavigation.map((group) => group.title)).toEqual([
      "工作台",
      "采购与补货",
      "集运与仓配",
      "库存与商品",
      "上架与订单",
      "经营分析",
    ]);
  });

  it("moves low-frequency setup entries out of primary operations", () => {
    const operationNames = operationsNavigation.flatMap((group) =>
      group.items.map((item) => item.name),
    );
    expect(operationNames).not.toContain("销售平台");
    expect(operationNames).not.toContain("仓库位置");
    expect(operationNames).not.toContain("团队成员");
    expect(operationNames).not.toContain("店铺管理");

    expect(settingsNavigation.map((item) => item.name)).toEqual(
      expect.arrayContaining(["销售平台", "仓库位置", "团队成员", "店铺管理"]),
    );
  });

  it("preserves existing route URLs for compatibility", () => {
    const allHrefs = [
      ...operationsNavigation.flatMap((group) => group.items.map((item) => item.href)),
      ...settingsNavigation.map((item) => item.href),
    ];
    expect(allHrefs).toContain("/procurement");
    expect(allHrefs).toContain("/logistics/consolidations");
    expect(allHrefs).toContain("/inventory/sellable");
    expect(allHrefs).toContain("/listing");
    expect(allHrefs).toContain("/sales");
    expect(allHrefs).toContain("/reports");
  });
});
```

- [ ] **Step 2: Run the failing navigation test**

Run:

```bash
npm test -- tests/application/navigation.test.ts
```

Expected:

```text
FAIL because current navigation still uses older groups such as 运营中心, 业务单据, 上架与平台, 报表
```

- [ ] **Step 3: Update `config/navigation.ts`**

Use these group boundaries while preserving route URLs:

```ts
export const operationsNavigation: NavGroup[] = [
  {
    title: "工作台",
    items: [
      { name: "工作台", href: "/workbench", icon: ClipboardList, badgeKey: "total" },
      { name: "通知", href: "/notifications", icon: Bell },
      {
        name: "异常中心",
        href: "/workbench?queue=exception",
        icon: TriangleAlert,
        queue: "exception",
        badgeKey: "exception",
      },
    ],
  },
  {
    title: "采购与补货",
    items: [{ name: "采购单据", href: "/procurement", icon: ShoppingCart }],
  },
  {
    title: "集运与仓配",
    items: [{ name: "集运物流", href: "/logistics/consolidations", icon: Truck }],
  },
  {
    title: "库存与商品",
    items: [
      { name: "库存看板", href: "/inventory/sellable", icon: PackageCheck },
      { name: "商品主档", href: "/inventory/skus", icon: Store },
      { name: "单件商品", href: "/inventory/items", icon: PackageOpen },
      { name: "库存批次", href: "/inventory/lots", icon: Package },
      { name: "库存盘点", href: "/inventory/stocktake", icon: Box },
    ],
  },
  {
    title: "上架与订单",
    items: [
      { name: "上架运营", href: "/listing", icon: Globe },
      { name: "销售订单", href: "/sales", icon: Package },
    ],
  },
  {
    title: "经营分析",
    items: [
      { name: "经营报表", href: "/reports", icon: FileText },
      { name: "团队工作量", href: "/reports/team", icon: Users },
    ],
  },
];
```

Add low-frequency setup entries:

```ts
export const settingsNavigation: NavItem[] = [
  { name: "销售平台", href: "/listing/platforms", icon: Store },
  { name: "仓库位置", href: "/inventory/locations", icon: MapPin },
  { name: "团队成员", href: "/settings/team", icon: Users },
  { name: "店铺管理", href: "/settings/stores", icon: Settings },
  { name: "切换操作人", href: "/login", icon: LogIn },
];
```

- [ ] **Step 4: Update route documentation**

In `docs/routes.md`, document the six groups and state:

```md
## 当前主导航

主导航面向每日操作，保留 6 个一级模块：

| 一级模块 | 当前入口 | 定位 |
| --- | --- | --- |
| 工作台 | `/workbench` | 今日待办、通知、异常处理 |
| 采购与补货 | `/procurement` | 采购单、到货、补货相关动作 |
| 集运与仓配 | `/logistics/consolidations` | 集运批次和跨仓流转 |
| 库存与商品 | `/inventory/sellable` | 库存看板、商品主档、批次、盘点 |
| 上架与订单 | `/listing`, `/sales` | 平台上架、销售订单、履约 |
| 经营分析 | `/reports` | 经营、平台、团队分析 |
```

- [ ] **Step 5: Update domain document**

Append this section to `docs/domain.md`:

```md
### 当前产品主线

当前阶段优先回答五个问题：

1. 货在哪里？
2. 这件货能不能卖？
3. 卖在哪个平台？
4. 下单后能不能按时发？
5. 最后到底赚了多少钱？

本阶段暂不把班车目标重量、截止装箱时间、SKU 缺重量阻断利润计算作为核心约束；这些进入后续集运精细化阶段。
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- tests/application/navigation.test.ts
npm run build
```

Expected:

```text
navigation tests pass
build passes
```

- [ ] **Step 7: Commit**

```bash
git add config/navigation.ts docs/routes.md docs/domain.md tests/application/navigation.test.ts
git commit -m "feat: reorganize ERP navigation modules"
```

---

### Task 3: Price and Profit Calculation Contract

**Files:**
- Modify: `lib/application/order-fees.ts`
- Create: `tests/application/order-fees.test.ts`

- [ ] **Step 1: Add failing tests for line allocation and profit**

Create `tests/application/order-fees.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  allocateAmountByLineAmount,
  computeOrderProfitSummary,
  parseFeeText,
} from "@/lib/application/order-fees";

describe("order fee and profit calculations", () => {
  it("parses percentage and amount fee text", () => {
    expect(parseFeeText("10%", new Decimal(200)).toFixed(4)).toBe("20.0000");
    expect(parseFeeText("300", new Decimal(200)).toFixed(4)).toBe("300.0000");
    expect(parseFeeText("", new Decimal(200)).toFixed(4)).toBe("0.0000");
  });

  it("allocates order-level amounts by line amount and assigns rounding remainder to the largest line", () => {
    const result = allocateAmountByLineAmount({
      amount: new Decimal("10.00"),
      lines: [
        { id: "small", lineAmount: new Decimal("33.33") },
        { id: "large", lineAmount: new Decimal("66.67") },
      ],
      scale: 2,
    });

    expect(result.map((line) => [line.id, line.amount.toFixed(2)])).toEqual([
      ["small", "3.33"],
      ["large", "6.67"],
    ]);
    expect(result.reduce((sum, line) => sum.plus(line.amount), new Decimal(0)).toFixed(2)).toBe("10.00");
  });

  it("calculates order profit summary from revenue, allocated fees, shipping, and inventory cost", () => {
    const summary = computeOrderProfitSummary({
      lines: [
        { id: "a", lineAmount: new Decimal("100"), inventoryCost: new Decimal("60") },
        { id: "b", lineAmount: new Decimal("50"), inventoryCost: new Decimal("20") },
      ],
      discountTotal: new Decimal("15"),
      platformFee: new Decimal("12"),
      shippingFee: new Decimal("8"),
      miscFee: new Decimal("5"),
      scale: 4,
    });

    expect(summary.grossRevenue.toFixed(4)).toBe("150.0000");
    expect(summary.netRevenue.toFixed(4)).toBe("110.0000");
    expect(summary.inventoryCost.toFixed(4)).toBe("80.0000");
    expect(summary.grossProfit.toFixed(4)).toBe("30.0000");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- tests/application/order-fees.test.ts
```

Expected:

```text
FAIL because allocateAmountByLineAmount and computeOrderProfitSummary do not exist
```

- [ ] **Step 3: Implement allocation and summary helpers**

Add these exports to `lib/application/order-fees.ts`:

```ts
export interface AllocationLineInput {
  id: string;
  lineAmount: Decimal;
}

export interface AllocatedAmount {
  id: string;
  amount: Decimal;
}

export function allocateAmountByLineAmount(input: {
  amount: Decimal;
  lines: AllocationLineInput[];
  scale?: number;
}): AllocatedAmount[] {
  const scale = input.scale ?? 4;
  if (input.lines.length === 0) return [];

  const totalLineAmount = input.lines.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0),
  );

  if (totalLineAmount.lte(0)) {
    const zeroRows = input.lines.map((line) => ({ id: line.id, amount: new Decimal(0) }));
    const largest = zeroRows[0];
    largest.amount = input.amount.toDecimalPlaces(scale);
    return zeroRows;
  }

  const largestLineId = input.lines.reduce((largest, line) =>
    line.lineAmount.gt(largest.lineAmount) ? line : largest,
  ).id;

  let allocatedTotal = new Decimal(0);
  const rows = input.lines.map((line) => {
    const amount = input.amount
      .times(line.lineAmount)
      .div(totalLineAmount)
      .toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
    allocatedTotal = allocatedTotal.plus(amount);
    return { id: line.id, amount };
  });

  const remainder = input.amount.toDecimalPlaces(scale).minus(allocatedTotal);
  if (!remainder.eq(0)) {
    const target = rows.find((row) => row.id === largestLineId) ?? rows[0];
    target.amount = target.amount.plus(remainder).toDecimalPlaces(scale);
  }

  return rows;
}

export interface OrderProfitLineInput {
  id: string;
  lineAmount: Decimal;
  inventoryCost: Decimal;
}

export interface OrderProfitSummary {
  grossRevenue: Decimal;
  discountTotal: Decimal;
  platformFee: Decimal;
  shippingFee: Decimal;
  miscFee: Decimal;
  netRevenue: Decimal;
  inventoryCost: Decimal;
  grossProfit: Decimal;
  lines: Array<{
    id: string;
    grossRevenue: Decimal;
    allocatedDiscount: Decimal;
    allocatedPlatformFee: Decimal;
    allocatedShippingFee: Decimal;
    allocatedMiscFee: Decimal;
    inventoryCost: Decimal;
    grossProfit: Decimal;
  }>;
}

export function computeOrderProfitSummary(input: {
  lines: OrderProfitLineInput[];
  discountTotal?: Decimal | null;
  platformFee?: Decimal | null;
  shippingFee?: Decimal | null;
  miscFee?: Decimal | null;
  scale?: number;
}): OrderProfitSummary {
  const scale = input.scale ?? 4;
  const discountTotal = input.discountTotal ?? new Decimal(0);
  const platformFee = input.platformFee ?? new Decimal(0);
  const shippingFee = input.shippingFee ?? new Decimal(0);
  const miscFee = input.miscFee ?? new Decimal(0);

  const grossRevenue = input.lines.reduce(
    (sum, line) => sum.plus(line.lineAmount),
    new Decimal(0),
  );
  const inventoryCost = input.lines.reduce(
    (sum, line) => sum.plus(line.inventoryCost),
    new Decimal(0),
  );

  const allocationLines = input.lines.map((line) => ({
    id: line.id,
    lineAmount: line.lineAmount,
  }));
  const discounts = new Map(
    allocateAmountByLineAmount({ amount: discountTotal, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount],
    ),
  );
  const platformFees = new Map(
    allocateAmountByLineAmount({ amount: platformFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount],
    ),
  );
  const shippingFees = new Map(
    allocateAmountByLineAmount({ amount: shippingFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount],
    ),
  );
  const miscFees = new Map(
    allocateAmountByLineAmount({ amount: miscFee, lines: allocationLines, scale }).map(
      (row) => [row.id, row.amount],
    ),
  );

  const lines = input.lines.map((line) => {
    const allocatedDiscount = discounts.get(line.id) ?? new Decimal(0);
    const allocatedPlatformFee = platformFees.get(line.id) ?? new Decimal(0);
    const allocatedShippingFee = shippingFees.get(line.id) ?? new Decimal(0);
    const allocatedMiscFee = miscFees.get(line.id) ?? new Decimal(0);
    const lineProfit = line.lineAmount
      .minus(allocatedDiscount)
      .minus(allocatedPlatformFee)
      .minus(allocatedShippingFee)
      .minus(allocatedMiscFee)
      .minus(line.inventoryCost)
      .toDecimalPlaces(scale);

    return {
      id: line.id,
      grossRevenue: line.lineAmount.toDecimalPlaces(scale),
      allocatedDiscount,
      allocatedPlatformFee,
      allocatedShippingFee,
      allocatedMiscFee,
      inventoryCost: line.inventoryCost.toDecimalPlaces(scale),
      grossProfit: lineProfit,
    };
  });

  const netRevenue = grossRevenue
    .minus(discountTotal)
    .minus(platformFee)
    .minus(shippingFee)
    .minus(miscFee)
    .toDecimalPlaces(scale);
  const grossProfit = netRevenue.minus(inventoryCost).toDecimalPlaces(scale);

  return {
    grossRevenue: grossRevenue.toDecimalPlaces(scale),
    discountTotal: discountTotal.toDecimalPlaces(scale),
    platformFee: platformFee.toDecimalPlaces(scale),
    shippingFee: shippingFee.toDecimalPlaces(scale),
    miscFee: miscFee.toDecimalPlaces(scale),
    netRevenue,
    inventoryCost: inventoryCost.toDecimalPlaces(scale),
    grossProfit,
    lines,
  };
}
```

- [ ] **Step 4: Run pricing tests**

Run:

```bash
npm test -- tests/application/order-fees.test.ts
```

Expected:

```text
PASS
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 6: Commit**

```bash
git add lib/application/order-fees.ts tests/application/order-fees.test.ts
git commit -m "feat: add order profit calculation contract"
```

---

### Task 4: Report Pricing Integration

**Files:**
- Modify: `app/actions/reports.ts`
- Modify: `tests/application/team-metrics.test.ts` only if existing expectations need updated naming
- Create: `tests/application/reports-profit.test.ts` if report helper extraction is needed

- [ ] **Step 1: Identify duplicate report calculations**

Run:

```bash
rg -n "netRevenue|grossProfit|platformFee|shippingFee|costAmount|totalPaid" app/actions/reports.ts lib/application tests/application
```

Expected:

```text
Find every place where reports recompute sales revenue, fees, inventory cost, or profit manually
```

- [ ] **Step 2: Extract report order lines into the pricing contract**

In `app/actions/reports.ts`, replace manual per-order profit math with `computeOrderProfitSummary`.

Expected import:

```ts
import { computeOrderProfitSummary } from "@/lib/application/order-fees";
```

Expected mapping shape:

```ts
const summary = computeOrderProfitSummary({
  lines: order.lines.map((line) => ({
    id: line.id,
    lineAmount: new Decimal(line.lineAmount.toString()),
    inventoryCost: line.allocations.reduce(
      (sum, allocation) => sum.plus(allocation.costAmount.toString()),
      new Decimal(0),
    ),
  })),
  discountTotal: new Decimal(order.discountTotal.toString()),
  platformFee: new Decimal(order.platformFee.toString()),
  shippingFee: new Decimal(order.shippingFee.toString()),
});
```

If the query does not select `line.id`, `line.lineAmount`, `discountTotal`, or `shippingFee`, add them to the Prisma select.

- [ ] **Step 3: Add or update tests around the report helper**

If `reports.ts` does not have testable pure functions, extract a pure helper:

```ts
export function summarizeReportOrderProfit(order: ReportOrderProfitInput) {
  return computeOrderProfitSummary({
    lines: order.lines.map((line) => ({
      id: line.id,
      lineAmount: new Decimal(line.lineAmount),
      inventoryCost: line.inventoryCost,
    })),
    discountTotal: new Decimal(order.discountTotal),
    platformFee: new Decimal(order.platformFee),
    shippingFee: new Decimal(order.shippingFee),
  });
}
```

Then test it in `tests/application/reports-profit.test.ts`.

- [ ] **Step 4: Verify**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 5: Commit**

```bash
git add app/actions/reports.ts tests/application
git commit -m "refactor: use shared profit calculations in reports"
```

---

### Task 5: Core Flow Browser Smoke Coverage

**Files:**
- Create: `tests/e2e/core-flow-smoke.spec.ts`

- [ ] **Step 1: Add route smoke test**

Create `tests/e2e/core-flow-smoke.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const routes = [
  { path: "/workbench", heading: "工作台" },
  { path: "/procurement", heading: "采购单据" },
  { path: "/logistics/consolidations", heading: "集运" },
  { path: "/inventory/sellable", heading: "库存" },
  { path: "/inventory/skus", heading: "SKU" },
  { path: "/listing", heading: "上架" },
  { path: "/sales", heading: "销售" },
  { path: "/reports", heading: "经营" },
];

test.describe("core ERP modules", () => {
  for (const route of routes) {
    test(`${route.path} renders without runtime errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));

      await page.goto(route.path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.getByRole("heading", { name: new RegExp(route.heading) })).toBeVisible();

      expect(
        errors.filter((line) =>
          /Runtime Error|Application error|Internal Server Error|Prisma|Unhandled/i.test(line),
        ),
      ).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run E2E smoke tests**

Run:

```bash
npm run test:e2e -- tests/e2e/core-flow-smoke.spec.ts
```

Expected:

```text
All route smoke tests pass.
If a heading expectation fails because a page uses a different heading, update the heading pattern only after manually confirming the page is the intended route.
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/core-flow-smoke.spec.ts
git commit -m "test: add core ERP module smoke coverage"
```

---

### Task 6: First Usability Pass After Module Reorganization

**Files:**
- Modify: `components/layout/sidebar.tsx` only if renamed modules create visual overflow or ambiguous active states.
- Modify: page headers under `app/(dashboard)` only when the page title conflicts with the new module name.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev -- -p 3100
```

Expected:

```text
Local server starts at http://localhost:3100
```

- [ ] **Step 2: Manually inspect primary routes**

Open:

```text
http://localhost:3100/workbench
http://localhost:3100/procurement
http://localhost:3100/logistics/consolidations
http://localhost:3100/inventory/sellable
http://localhost:3100/listing
http://localhost:3100/sales
http://localhost:3100/reports
```

Check:

```text
Sidebar labels do not wrap badly.
Active route state is understandable.
Settings entries are accessible but not mixed into daily operations.
No page has an obvious stale title that contradicts the new module grouping.
```

- [ ] **Step 3: Fix only confirmed usability defects**

Examples of allowed small fixes:

```tsx
// components/layout/sidebar.tsx
<span className="truncate">{item.name}</span>
```

```tsx
// app/(dashboard)/inventory/sellable/page.tsx
<PageHeader title="库存看板" description="查看可售库存、上架覆盖和库存风险" />
```

- [ ] **Step 4: Verify**

Run:

```bash
npx tsc --noEmit
npm test
npm run build
npm run test:e2e -- tests/e2e/core-flow-smoke.spec.ts
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 5: Commit**

```bash
git add components app tests
git commit -m "fix: polish navigation usability after module regrouping"
```

---

## Follow-Up Backlog After This Plan

1. Add a full purchase -> receive -> stock ledger -> listing -> order -> shipment -> report E2E flow.
2. Add structured server action error results for high-frequency forms instead of raw thrown errors.
3. Add import validation previews for SKU, lot, order, and listing imports.
4. Add order cancellation/return regression tests around allocation release and ledger reversal.
5. Add detailed settlement model for partner operation fees, Japanese domestic shipping, exchange-rate gains/losses, and tax/customs fees.
6. Later: add shuttle bus plans, target weight, cutoff times, and SKU weight/dimension completeness checks.

## Self-Review

- Spec coverage: The plan addresses module reorganization, price/profit calculation, and systematic bug/usability detection. It explicitly excludes shuttle bus weight/time and SKU missing-weight profit blockers for this iteration.
- Placeholder scan: No `TBD`, `TODO`, or open-ended "handle edge cases" instructions remain.
- Type consistency: New pricing helpers consistently use `Decimal`, `lineAmount`, `inventoryCost`, and exported function names from `lib/application/order-fees.ts`.

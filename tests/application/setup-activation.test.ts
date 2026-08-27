import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveSetupStatus,
  getMissingSetupLabels,
  resolveSetupPath,
  type SetupSnapshot,
} from "@/lib/application/setup-status";

function snapshot(overrides: Partial<SetupSnapshot> = {}): SetupSnapshot {
  return {
    storeId: "store-1",
    storeName: "主店",
    storeCurrency: "CNY",
    role: "OWNER",
    locationCount: 0,
    operationalSkuCount: 0,
    platformCount: 0,
    inventoryLotCount: 0,
    itemUnitCount: 0,
    openingStockCount: 0,
    purchaseOrderCount: 0,
    ...overrides,
  };
}

describe("first-login setup activation", () => {
  it("derives setup progress from operational data", () => {
    const status = deriveSetupStatus(
      snapshot({
        locationCount: 1,
        platformCount: 1,
        operationalSkuCount: 2,
        openingStockCount: 1,
      })
    );

    expect(status.operationalSkuCount).toBe(2);
    expect(status.completedCoreCount).toBe(4);
    expect(status.isCoreComplete).toBe(true);
    expect(status.shouldShowWorkbenchPrompt).toBe(false);
  });

  it("accepts either an inventory migration or a first purchase order as the activation branch", () => {
    const migrated = deriveSetupStatus(snapshot({ itemUnitCount: 1 }));
    const purchasing = deriveSetupStatus(snapshot({ purchaseOrderCount: 1 }));

    expect(migrated.hasInventoryOrPurchaseOrder).toBe(true);
    expect(resolveSetupPath(undefined, migrated)).toBe("existing");
    expect(purchasing.hasInventoryOrPurchaseOrder).toBe(true);
    expect(resolveSetupPath(undefined, purchasing)).toBe("purchase");
  });

  it("only prompts an incomplete owner on the workbench", () => {
    const owner = deriveSetupStatus(snapshot());
    const invitedMember = deriveSetupStatus(snapshot({ role: "VIEWER" }));

    expect(owner.shouldShowWorkbenchPrompt).toBe(true);
    expect(invitedMember.shouldShowWorkbenchPrompt).toBe(false);
    expect(getMissingSetupLabels(owner)).toEqual([
      "仓库位置",
      "可交易 SKU",
      "销售平台",
      "首批库存或采购单",
    ]);
  });

  it("routes a newly created organization to setup and preserves setup return links", () => {
    const onboarding = readFileSync(
      join(process.cwd(), "components/auth/onboarding-panel.tsx"),
      "utf8"
    );
    const checklist = readFileSync(
      join(process.cwd(), "components/setup/setup-checklist.tsx"),
      "utf8"
    );
    const workbench = readFileSync(
      join(process.cwd(), "app/(dashboard)/workbench/page.tsx"),
      "utf8"
    );

    expect(onboarding).toContain('router.push("/setup?welcome=1")');
    expect(onboarding).not.toContain('router.push("/workbench?welcome=1")');
    expect(checklist).toContain('selectedPath ? `/setup?path=${selectedPath}` : "/setup"');
    expect(checklist).toContain('"/inventory/locations?create=1"');
    expect(checklist).toContain("returnTo=${encodeURIComponent(returnTo)}");
    expect(workbench).toContain("SetupResumeBanner");
    expect(workbench).toContain('context.role === "OWNER"');
  });
});

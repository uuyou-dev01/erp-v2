import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertCurrentShipmentAccess } from "@/lib/application/shipping-authorization";
import { canShipOrders } from "@/lib/auth/permissions";
import { grantsLocationCapability } from "@/lib/auth/scope-access";

describe("shipping authorization", () => {
  it("only grants shipment work to current operating roles", () => {
    expect(["OWNER", "ADMIN", "MANAGER", "FULFILLMENT"].map(canShipOrders)).toEqual([
      true,
      true,
      true,
      true,
    ]);
    expect(["LISTING", "FINANCE", "VIEWER"].map(canShipOrders)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("requires every allocated warehouse and the current assignment", () => {
    expect(() =>
      assertCurrentShipmentAccess({
        role: "FULFILLMENT",
        userId: "user-a",
        allocationLocationIds: ["warehouse-a", "warehouse-b"],
        authorizedLocationIds: ["warehouse-a"],
      })
    ).toThrow("库存所在仓库");

    expect(() =>
      assertCurrentShipmentAccess({
        role: "FULFILLMENT",
        userId: "user-a",
        allocationLocationIds: ["warehouse-a"],
        authorizedLocationIds: ["warehouse-a"],
        assignedToId: "user-b",
      })
    ).toThrow("指派给其他执行人");
  });

  it("honors an explicit warehouse list even for an operating role", () => {
    expect(
      grantsLocationCapability(
        {
          locationId: "warehouse-a",
          role: "FULFILLMENT",
          permissions: { shipLocationIds: ["warehouse-a"] },
        },
        "ship"
      )
    ).toBe(true);
    expect(
      grantsLocationCapability(
        {
          locationId: "warehouse-new",
          role: "FULFILLMENT",
          permissions: { shipLocationIds: ["warehouse-a"] },
        },
        "ship"
      )
    ).toBe(false);
  });

  it("enforces the shared authorization at the ordinary order action boundary", () => {
    const source = readFileSync(
      join(process.cwd(), "app/actions/customer-orders.ts"),
      "utf8"
    );
    expect(source).toContain("await assertCanShipCustomerOrder({");
    expect(source).toContain("role: context.role");

    const taskSource = readFileSync(join(process.cwd(), "app/actions/tasks.ts"), "utf8");
    expect(taskSource).toContain("只有运营负责人及以上角色可以指派任务");
  });
});

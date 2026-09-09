import { describe, expect, it } from "vitest";
import {
  capabilitiesForWarehouseRole,
  COLLABORATION_CAPABILITY,
  normalizeWarehouseFulfillerRole,
  resolveAuthenticatedDestination,
} from "@/lib/application/relationship-foundation";

describe("relationship foundation", () => {
  it("keeps warehouse dispatch separate from roster administration", () => {
    expect(capabilitiesForWarehouseRole("MANAGER")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
      COLLABORATION_CAPABILITY.WAREHOUSE_DISPATCH,
    ]);
    expect(capabilitiesForWarehouseRole("OPERATOR")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
    ]);
    expect(capabilitiesForWarehouseRole("BACKUP")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
    ]);
  });

  it("accepts the legacy backup role but rejects new unknown values", () => {
    expect(normalizeWarehouseFulfillerRole("backup")).toBe("BACKUP");
    expect(() => normalizeWarehouseFulfillerRole("ADMIN")).toThrow("任务角色");
  });

  it("routes a person by their active relationships without losing deep links", () => {
    expect(
      resolveAuthenticatedDestination({
        requestedNext: "/invite/warehouse/token",
        hasMembership: false,
        hasWarehouseRelationship: false,
      })
    ).toBe("/invite/warehouse/token");
    expect(
      resolveAuthenticatedDestination({
        hasMembership: false,
        hasWarehouseRelationship: true,
      })
    ).toBe("/collaboration");
    expect(
      resolveAuthenticatedDestination({
        hasMembership: true,
        hasWarehouseRelationship: true,
      })
    ).toBe("/workbench");
  });
});

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { buildShipmentFulfillmentContext } from "@/lib/application/workflow-queries";

const locationA = { id: "loc-a", code: "SHA", name: "上海家庭仓" };
const locationB = { id: "loc-b", code: "TYO", name: "东京仓" };

function lotAllocation(input: {
  id: string;
  lotId: string;
  quantity: string;
  location?: typeof locationA;
  status?: string;
}) {
  return {
    id: input.id,
    allocationType: "LOT",
    quantity: new Decimal(input.quantity),
    status: input.status ?? "ALLOCATED",
    orderLine: { sku: { code: "SKU-1", name: "测试商品" } },
    inventoryLot: {
      id: input.lotId,
      batchLabel: "LOT-20260816",
      location: input.location ?? locationA,
    },
    itemUnit: null,
  };
}

describe("shipment fulfillment context", () => {
  it("groups allocations by real inventory source and computes the post-shipment balance", () => {
    const context = buildShipmentFulfillmentContext(
      [
        lotAllocation({ id: "allocation-1", lotId: "lot-1", quantity: "1" }),
        lotAllocation({ id: "allocation-2", lotId: "lot-1", quantity: "2" }),
      ],
      [{ entityType: "LOT", entityId: "lot-1", deltaQty: new Decimal("10") }]
    );

    expect(context).toMatchObject({
      totalQuantity: "3",
      isMultiLocation: false,
      isComplete: true,
      locations: [{ id: "loc-a", code: "SHA", name: "上海家庭仓", quantity: "3" }],
    });
    expect(context.allocations).toHaveLength(1);
    expect(context.allocations[0]).toMatchObject({
      inventoryReference: "LOT-20260816",
      quantity: "3",
      remainingAfterShipment: "7",
      locationName: "上海家庭仓",
    });
  });

  it("surfaces every warehouse for multi-location fulfillment", () => {
    const context = buildShipmentFulfillmentContext(
      [
        lotAllocation({ id: "allocation-a", lotId: "lot-a", quantity: "1" }),
        lotAllocation({
          id: "allocation-b",
          lotId: "lot-b",
          quantity: "2",
          location: locationB,
        }),
      ],
      [
        { entityType: "LOT", entityId: "lot-a", deltaQty: new Decimal("4") },
        { entityType: "LOT", entityId: "lot-b", deltaQty: new Decimal("5") },
      ]
    );

    expect(context.isMultiLocation).toBe(true);
    expect(context.locations.map((location) => location.name)).toEqual(["上海家庭仓", "东京仓"]);
    expect(context.totalQuantity).toBe("3");
  });

  it("does not present closed allocations as pending outbound stock", () => {
    const context = buildShipmentFulfillmentContext(
      [
        lotAllocation({
          id: "allocation-shipped",
          lotId: "lot-shipped",
          quantity: "1",
          status: "SHIPPED",
        }),
      ],
      []
    );

    expect(context.allocations).toEqual([]);
    expect(context.isComplete).toBe(false);
    expect(context.totalQuantity).toBe("0");
  });
});

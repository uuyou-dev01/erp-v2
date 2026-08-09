import { describe, expect, it, vi } from "vitest";
import { createInboundInventoryLot } from "@/lib/application/inventory";

describe("opening stock ledger semantics", () => {
  it("creates a formal opening-balance ledger entry instead of a purchase inbound", async () => {
    const inventoryLotCreate = vi.fn().mockResolvedValue({ id: "lot_opening_1" });
    const stockLedgerCreate = vi.fn().mockResolvedValue({ id: "ledger_opening_1" });
    const tx = {
      inventoryLot: { create: inventoryLotCreate },
      stockLedger: { create: stockLedgerCreate },
    };

    await createInboundInventoryLot(tx as never, {
      storeId: "store_1",
      skuId: "sku_1",
      locationId: "location_1",
      quantity: "3",
      unitCost: "98.50",
      costCurrency: "CNY",
      sourceType: "OPENING_STOCK",
      sourceId: "opening_line_1",
      receivedAt: new Date("2026-07-01T00:00:00.000Z"),
      batchLabel: "OPEN-20260701-ABC123",
      refType: "OPENING_STOCK_LINE",
      refId: "opening_line_1",
      ledgerReason: "OPENING_BALANCE",
      meta: {
        openingStockId: "opening_1",
        documentNo: "OPEN-20260701-ABC123",
      },
    });

    expect(inventoryLotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: "OPENING_STOCK",
        sourceId: "opening_line_1",
        batchLabel: "OPEN-20260701-ABC123",
      }),
    });
    expect(stockLedgerCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "LOT",
        entityId: "lot_opening_1",
        deltaQty: "3.0000",
        reason: "OPENING_BALANCE",
        refType: "OPENING_STOCK_LINE",
        refId: "opening_line_1",
      }),
    });
  });
});

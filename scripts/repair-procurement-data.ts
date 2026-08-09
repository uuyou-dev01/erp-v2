import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const DEMO_STORE_ID = "store_1";
const DEMO_ORDER_NO = "PO-DEMO-SPU-001";

function isKnownTestStore(store: { organizationId: string | null; id: string; code: string }) {
  if (store.organizationId !== null || store.id === DEMO_STORE_ID) return false;
  return (
    store.id.startsWith("store_import_action_") ||
    store.code.startsWith("STORE_import_action_") ||
    store.code.startsWith("SUP_marketplace_resale_") ||
    store.code.startsWith("HID_marketplace_resale_")
  );
}

async function main() {
  const [stores, fxRates, demoOrder] = await Promise.all([
    prisma.store.findMany({
      select: { id: true, organizationId: true, code: true, name: true },
    }),
    prisma.fxRate.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.purchaseOrder.findFirst({
      where: { storeId: DEMO_STORE_ID, orderNo: DEMO_ORDER_NO },
      include: { lines: true },
    }),
  ]);

  const testStores = stores.filter(isKnownTestStore);
  const keptFxDayKeys = new Set<string>();
  const fxIdsToDelete: string[] = [];
  for (const rate of fxRates) {
    if (rate.fromCurrency === "XCN" || rate.toCurrency === "XCN") {
      fxIdsToDelete.push(rate.id);
      continue;
    }
    const dayKey = `${rate.fromCurrency}->${rate.toCurrency}@${rate.effectiveDate
      .toISOString()
      .slice(0, 10)}`;
    if (keptFxDayKeys.has(dayKey)) {
      fxIdsToDelete.push(rate.id);
    } else {
      keptFxDayKeys.add(dayKey);
    }
  }

  const lineTotal =
    demoOrder?.lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
      new Decimal(0)
    ) ?? null;
  const suggestedRate = demoOrder
    ? await prisma.fxRate.findFirst({
        where: {
          fromCurrency: demoOrder.currency,
          toCurrency: "CNY",
          effectiveDate: { lte: demoOrder.orderedAt ?? demoOrder.createdAt },
        },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      })
    : null;

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        testStoresToDelete: testStores.length,
        testStoreSamples: testStores.slice(0, 5),
        fxRowsBefore: fxRates.length,
        fxRowsToDelete: fxIdsToDelete.length,
        fxRowsAfter: fxRates.length - fxIdsToDelete.length,
        demoOrder: demoOrder
          ? {
              id: demoOrder.id,
              status: demoOrder.status,
              currency: demoOrder.currency,
              fxRate: demoOrder.fxRate?.toString() ?? null,
              totalAmount: demoOrder.totalAmount.toString(),
              lineTotal: lineTotal?.toString(),
              suggestedRate: suggestedRate?.rate.toString() ?? null,
            }
          : null,
      },
      null,
      2
    )
  );

  if (!APPLY) return;
  if (!demoOrder || !lineTotal) throw new Error("目标演示采购单不存在，已停止修复");

  await prisma.$transaction(
    async (tx) => {
      const lineBySkuId = new Map(demoOrder.lines.map((line) => [line.skuId, line]));
      const legacyLots = await tx.inventoryLot.findMany({
        where: {
          storeId: DEMO_STORE_ID,
          sourceType: "PURCHASE",
          sourceId: demoOrder.id,
        },
      });
      for (const lot of legacyLots) {
        const line = lineBySkuId.get(lot.skuId);
        if (!line) throw new Error(`库存批次 ${lot.id} 无法匹配采购明细`);
        await tx.inventoryLot.update({
          where: { id: lot.id },
          data: { sourceId: line.id },
        });
        await tx.stockLedger.updateMany({
          where: {
            entityType: "LOT",
            entityId: lot.id,
            refType: "PURCHASE_ORDER",
            refId: demoOrder.id,
          },
          data: { refType: "PURCHASE_LINE", refId: line.id },
        });
      }

      if (!demoOrder.destinationLocationId || !demoOrder.receivedAt) {
        throw new Error("演示采购单缺少收货位置或收货日期");
      }
      for (const line of demoOrder.lines) {
        const [lot, unit] = await Promise.all([
          tx.inventoryLot.findFirst({
            where: { sourceType: "PURCHASE", sourceId: line.id },
            select: { id: true },
          }),
          tx.itemUnit.findFirst({
            where: { sourceType: "PURCHASE", sourceId: line.id },
            select: { id: true },
          }),
        ]);
        if (lot || unit) continue;
        const createdLot = await tx.inventoryLot.create({
          data: {
            storeId: DEMO_STORE_ID,
            skuId: line.skuId,
            locationId: demoOrder.destinationLocationId,
            unitCost: line.unitPrice,
            costCurrency: demoOrder.currency,
            sourceType: "PURCHASE",
            sourceId: line.id,
            receivedAt: demoOrder.receivedAt,
            batchLabel: `${DEMO_ORDER_NO}-${line.id.slice(-4)}`,
          },
        });
        await tx.stockLedger.create({
          data: {
            storeId: DEMO_STORE_ID,
            occurredAt: demoOrder.receivedAt,
            entityType: "LOT",
            entityId: createdLot.id,
            locationId: demoOrder.destinationLocationId,
            deltaQty: line.quantity,
            reason: "INBOUND_PURCHASE",
            refType: "PURCHASE_LINE",
            refId: line.id,
            meta: { repairedBy: "repair-procurement-data" },
          },
        });
      }

      await tx.purchaseOrder.update({
        where: { id: demoOrder.id },
        data: {
          fxRate: suggestedRate?.rate ?? new Decimal("0.05"),
          subtotal: lineTotal,
          totalAmount: lineTotal,
          status: demoOrder.status === "RETURNED" ? "RECEIVED" : demoOrder.status,
          shipmentNote:
            demoOrder.status === "RETURNED" && demoOrder.shipmentNote === "退货终止"
              ? null
              : demoOrder.shipmentNote,
        },
      });

      if (fxIdsToDelete.length > 0) {
        await tx.fxRate.deleteMany({ where: { id: { in: fxIdsToDelete } } });
      }
      if (testStores.length > 0) {
        await tx.store.deleteMany({ where: { id: { in: testStores.map((store) => store.id) } } });
      }
    },
    { maxWait: 10_000, timeout: 120_000 }
  );

  console.log("采购数据修复与测试残留清理已完成。");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

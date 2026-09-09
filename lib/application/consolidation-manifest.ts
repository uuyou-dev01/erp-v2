import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";

export interface ConsolidationManifestLine {
  id: string;
  sourceType: string;
  sourceId: string;
  skuCode: string | null;
  title: string;
  imageUrl: string | null;
  quantity: string;
}

type ConsolidationSourceLine = {
  id: string;
  sourceType: string;
  sourceId: string;
  quantity: { toString(): string } | string;
};

export async function resolveConsolidationManifestLines(
  lines: readonly ConsolidationSourceLine[]
): Promise<ConsolidationManifestLine[]> {
  const purchaseLineIds = lines
    .filter((line) => line.sourceType === "PURCHASE_LINE")
    .map((line) => line.sourceId);
  const lotIds = lines.filter((line) => line.sourceType === "LOT").map((line) => line.sourceId);
  const itemUnitIds = lines
    .filter((line) => line.sourceType === "ITEM_UNIT")
    .map((line) => line.sourceId);
  const quickEntryIds = lines
    .filter((line) => line.sourceType === "QUICK_ENTRY")
    .map((line) => line.sourceId);

  const [purchaseLines, lots, itemUnits, quickEntries] = await Promise.all([
    prisma.purchaseLine.findMany({
      where: { id: { in: purchaseLineIds } },
      select: {
        id: true,
        sku: { select: { code: true, name: true, imageUrl: true } },
      },
    }),
    prisma.inventoryLot.findMany({
      where: { id: { in: lotIds } },
      select: {
        id: true,
        sku: { select: { code: true, name: true, imageUrl: true } },
      },
    }),
    prisma.itemUnit.findMany({
      where: { id: { in: itemUnitIds } },
      select: {
        id: true,
        sku: { select: { code: true, name: true, imageUrl: true } },
      },
    }),
    prisma.quickEntry.findMany({
      where: { id: { in: quickEntryIds } },
      select: {
        id: true,
        rawBrand: true,
        rawProductName: true,
        rawVariant: true,
        generatedSkuId: true,
      },
    }),
  ]);
  const generatedSkus = await prisma.sKU.findMany({
    where: {
      id: {
        in: quickEntries
          .map((entry) => entry.generatedSkuId)
          .filter((id): id is string => Boolean(id)),
      },
    },
    select: { id: true, code: true, name: true, imageUrl: true },
  });
  const generatedSkuById = new Map(generatedSkus.map((sku) => [sku.id, sku]));

  const productBySource = new Map<
    string,
    { code: string | null; name: string; imageUrl: string | null }
  >();
  for (const line of purchaseLines) {
    productBySource.set(`PURCHASE_LINE:${line.id}`, line.sku);
  }
  for (const lot of lots) {
    productBySource.set(`LOT:${lot.id}`, lot.sku);
  }
  for (const unit of itemUnits) {
    productBySource.set(`ITEM_UNIT:${unit.id}`, unit.sku);
  }
  for (const entry of quickEntries) {
    const generatedSku = entry.generatedSkuId ? generatedSkuById.get(entry.generatedSkuId) : null;
    const fallbackName = [entry.rawBrand, entry.rawProductName, entry.rawVariant]
      .filter(Boolean)
      .join(" ");
    productBySource.set(`QUICK_ENTRY:${entry.id}`, {
      code: generatedSku?.code ?? null,
      name: generatedSku?.name ?? (fallbackName || "未识别商品"),
      imageUrl: generatedSku?.imageUrl ?? null,
    });
  }

  return lines.map((line) => {
    const product = productBySource.get(`${line.sourceType}:${line.sourceId}`);
    return {
      id: line.id,
      sourceType: line.sourceType,
      sourceId: line.sourceId,
      skuCode: product?.code ?? null,
      title: product?.name ?? "未识别商品",
      imageUrl: product?.imageUrl ?? null,
      quantity: new Decimal(line.quantity.toString()).toString(),
    };
  });
}

export function consolidationManifestQuantity(lines: readonly { quantity: string }[]) {
  return lines.reduce((total, line) => total.plus(line.quantity), new Decimal(0)).toString();
}

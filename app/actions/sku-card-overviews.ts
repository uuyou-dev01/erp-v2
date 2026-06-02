"use server";

import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";
import { getStoreStockBreakdown } from "@/lib/application/inventory";
import type { ProductLifecycleStage } from "@/lib/application/next-actions";
import { LIFECYCLE_LABELS } from "@/lib/application/next-actions";

export interface SkuCardVariantStock {
  skuId: string;
  skuCode: string;
  variantName: string;
  newStockCount: number;
  newStockAvgCost: string | null;
  newStockCurrency: string | null;
  newStockLocation: string | null;
  newStockStatus: "已上架" | "在途" | "未上架";
  newStockPlatforms: Array<{ code: string; name: string }>;
  lifecycleStage: ProductLifecycleStage;
  lifecycleStageLabel: string;
  nextActionLabel: string;
  nextActionHref: string;
  riskTags: string[];
  platformSummary: string;
  platformStatuses: Array<{
    code: string;
    name: string;
    status: "LISTED" | "NOT_CREATED" | "SYNC_OK" | "SYNC_EXCEPTION";
    statusLabel: string;
    stockLabel: string;
  }>;
  lockedCount: number;
  usedItems: Array<{
    id: string;
    code: string;
    condition: string;
    cost: string;
    currency: string;
    location: string;
    status: "已上架" | "在途" | "未上架" | "已售出";
    platforms: Array<{ code: string; name: string }>;
  }>;
}

function deriveVariantLifecycle(input: {
  newStockStatus: "已上架" | "在途" | "未上架";
  newStockCount: number;
  usedAvailableCount: number;
  usedSoldCount: number;
  hasListings: boolean;
  inTransit: boolean;
}) {
  const riskTags: string[] = [];
  let lifecycleStage: ProductLifecycleStage = "IN_STOCK";
  let nextActionLabel = "查看完整生命周期";

  if (input.inTransit || input.newStockStatus === "在途") {
    lifecycleStage = "PROCURING";
    nextActionLabel = "查看物流";
    riskTags.push("在途待确认");
  } else if (input.usedSoldCount > 0 && input.usedAvailableCount === 0 && input.newStockCount === 0) {
    lifecycleStage = "COMPLETED";
    nextActionLabel = "查看利润";
  } else if (input.usedSoldCount > 0) {
    lifecycleStage = "SELLING";
    nextActionLabel = "处理发货/结算";
  } else if (input.usedAvailableCount > 0 && !input.hasListings) {
    lifecycleStage = "IN_STOCK";
    nextActionLabel = "添加上架记录";
    riskTags.push("中古待上架检查");
  }

  if (input.newStockCount > 0 && !input.hasListings && !input.inTransit) {
    riskTags.push("待上架检查");
  }

  return {
    lifecycleStage,
    lifecycleStageLabel: LIFECYCLE_LABELS[lifecycleStage],
    nextActionLabel,
    riskTags,
  };
}

export interface SkuCardProduct {
  cardId: string;
  brand: string | null;
  name: string;
  imageUrl: string | null;
  variantCount: number;
  variants: SkuCardVariantStock[];
}

function listingStatusLabel(
  hasActiveListing: boolean,
  locationType: string,
  qty: number
): "已上架" | "在途" | "未上架" {
  if (hasActiveListing && qty > 0) return "已上架";
  if (locationType === "TRANSIT" || /转运|在途/i.test(locationType)) return "在途";
  return "未上架";
}

function itemStatusLabel(
  status: string,
  hasListing: boolean
): "已上架" | "在途" | "未上架" | "已售出" {
  if (status === "CONSUMED" || status === "ALLOCATED") return "已售出";
  if (hasListing) return "已上架";
  if (status === "RETURN_CHECK") return "在途";
  return "未上架";
}

export async function getSkuCardOverviews(storeId: string): Promise<SkuCardProduct[]> {
  const skus = await prisma.sKU.findMany({
    where: { storeId },
    include: {
      parentSku: { select: { id: true, code: true, name: true, brand: true, imageUrl: true } },
      childSkus: {
        select: {
          id: true,
        },
      },
      inventoryLots: {
        where: { status: "ACTIVE" },
        include: { location: true },
      },
      itemUnits: {
        where: { status: { in: ["AVAILABLE", "ALLOCATED", "RETURN_CHECK"] } },
        include: { location: true, listings: { where: { status: "ACTIVE" }, include: { platform: true } } },
      },
      listings: {
        where: { status: "ACTIVE" },
        include: { platform: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const stockMap = await getStoreStockBreakdown(storeId);
  const platforms = await prisma.platform.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" },
  });

  const lotIds = skus.flatMap((s) => s.inventoryLots.map((l) => l.id));

  const ledgers =
    lotIds.length > 0
      ? await prisma.stockLedger.groupBy({
          by: ["entityId"],
          where: { storeId, entityType: "LOT", entityId: { in: lotIds } },
          _sum: { deltaQty: true },
        })
      : [];

  const lotQtyMap = new Map(
    ledgers.map((l) => [l.entityId, new Decimal(l._sum.deltaQty?.toString() ?? "0").toNumber()])
  );

  type SkuOverviewRow = (typeof skus)[number];
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const groups = new Map<string, SkuOverviewRow[]>();

  for (const sku of skus) {
    const groupId = sku.parentSkuId && skuById.has(sku.parentSkuId) ? sku.parentSkuId : sku.id;
    const group = groups.get(groupId) ?? [];
    groups.set(groupId, [...group, sku]);
  }

  const cards: SkuCardProduct[] = [];

  for (const [cardId, members] of groups) {
    const root = members.find((m) => !m.parentSkuId) ?? members[0];
    const displayName = root.parentSku
      ? root.parentSku.name
      : root.name.replace(/\s+(佩恩|蝎|小南|端盒|鼬|鬼鲛|迪达拉|41|42|43|44|s|m|l).*$/i, "").trim() || root.name;

    const variants: Array<SkuCardVariantStock & { _inTransit: boolean }> = members.map((sku) => {
      const attr = (sku.attributes || {}) as Record<string, unknown>;
      const variantName =
        (typeof attr.variant === "string" && attr.variant) ||
        sku.name.replace(displayName, "").trim() ||
        sku.code;

      let newStockCount = 0;
      let costSum = new Decimal(0);
      let costCount = 0;
      let locationName = "-";
      let currency = "CNY";
      const platformSet = new Map<string, { code: string; name: string }>();
      const itemPlatformSet = new Map<string, { code: string; name: string }>();

      for (const lot of sku.inventoryLots) {
        const qty = lotQtyMap.get(lot.id) ?? 0;
        if (qty <= 0) continue;
        newStockCount += qty;
        costSum = costSum.plus(new Decimal(lot.unitCost.toString()).times(qty));
        costCount += qty;
        locationName = lot.location.name;
        currency = lot.costCurrency;
      }

      for (const listing of sku.listings) {
        platformSet.set(listing.platform.id, {
          code: listing.platform.code,
          name: listing.platform.name,
        });
      }

      const breakdown = stockMap.get(sku.id);
      const primaryLot = sku.inventoryLots[0];
      const locType = primaryLot?.location.type ?? "WAREHOUSE";
      const newStatus = listingStatusLabel(platformSet.size > 0, locType, newStockCount);

      const usedItems = sku.itemUnits.map((item, idx) => {
        const platforms = item.listings.map((l) => ({
          code: l.platform.code,
          name: l.platform.name,
        }));
        for (const platform of platforms) {
          itemPlatformSet.set(platform.code, platform);
        }
        return {
          id: item.id,
          code: `NO.${String(idx + 1).padStart(3, "0")}`,
          condition: item.conditionGrade || "中古",
          cost: item.unitCost.toString(),
          currency: item.costCurrency,
          location: item.location.name,
          status: itemStatusLabel(item.status, platforms.length > 0),
          platforms,
        };
      });
      const lockedCount = sku.itemUnits.filter((item) => item.status === "ALLOCATED").length;
      const usedSoldCount = usedItems.filter((item) => item.status === "已售出").length;
      const usedAvailableCount = usedItems.length - usedSoldCount;
      const lifecycle = deriveVariantLifecycle({
        newStockStatus: newStatus,
        newStockCount,
        usedAvailableCount,
        usedSoldCount,
        hasListings: platformSet.size > 0 || usedItems.some((item) => item.platforms.length > 0),
        inTransit: (breakdown?.inTransitQty ?? 0) > 0,
      });
      const allPlatforms = new Map(platformSet);
      for (const item of usedItems) {
        for (const platform of item.platforms) {
          allPlatforms.set(platform.code, platform);
        }
      }
      const platformStatuses = platforms.map((platform) => {
        const hasSkuListing = platformSet.has(platform.id);
        const hasItemListing = itemPlatformSet.has(platform.code);
        if (hasSkuListing) {
          return {
            code: platform.code,
            name: platform.name,
            status: "SYNC_OK" as const,
            statusLabel: "已上架",
            stockLabel: `库存 ${newStockCount}`,
          };
        }
        if (hasItemListing) {
          return {
            code: platform.code,
            name: platform.name,
            status: "LISTED" as const,
            statusLabel: "中古已上架",
            stockLabel: `${usedItems.filter((item) => item.platforms.some((p) => p.code === platform.code)).length} 件`,
          };
        }
        return {
          code: platform.code,
          name: platform.name,
          status: "NOT_CREATED" as const,
          statusLabel: "未添加上架记录",
          stockLabel: newStockCount > 0 ? `新品库存 ${newStockCount}` : "无可售库存",
        };
      });

      return {
        skuId: sku.id,
        skuCode: sku.code,
        variantName,
        newStockCount,
        newStockAvgCost:
          costCount > 0 ? costSum.div(costCount).toFixed(2) : null,
        newStockCurrency: currency,
        newStockLocation: locationName,
        newStockStatus: newStatus,
        newStockPlatforms: Array.from(platformSet.values()),
        lifecycleStage: lifecycle.lifecycleStage,
        lifecycleStageLabel: lifecycle.lifecycleStageLabel,
        nextActionLabel: lifecycle.nextActionLabel,
        nextActionHref: `/inventory/skus/${sku.id}`,
        riskTags: lifecycle.riskTags,
        platformSummary:
          platformStatuses.length > 0
            ? platformStatuses
                .slice(0, 2)
                .map((p) => `${p.name} ${p.statusLabel}`)
                .join(" / ")
            : allPlatforms.size > 0
              ? Array.from(allPlatforms.values()).map((p) => p.name).join(" / ")
              : "暂无平台",
        platformStatuses,
        lockedCount,
        usedItems,
        _inTransit: (breakdown?.inTransitQty ?? 0) > 0,
      };
    });

    cards.push({
      cardId,
      brand: root.brand ?? root.parentSku?.brand ?? null,
      name: displayName,
      imageUrl: root.imageUrl ?? root.parentSku?.imageUrl ?? null,
      variantCount: variants.length,
      variants: variants.map(({ _inTransit, ...v }) => {
        if (_inTransit && v.newStockStatus === "未上架") {
          return { ...v, newStockStatus: "在途" as const };
        }
        return v;
      }),
    });
  }

  return cards;
}

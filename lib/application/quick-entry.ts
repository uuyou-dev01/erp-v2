import { prisma } from "@/lib/prisma";
import type { Prisma, QuickEntry } from "@prisma/client";
import Decimal from "decimal.js";
import { createInboundInventoryLot, createInboundItemUnit } from "@/lib/application/inventory";
import { computeOrderFees, feeResultToStrings, parseFeeText } from "@/lib/application/order-fees";
import {
  detectIncompleteFields,
  isUsedCondition,
  matchPlatformCode,
  normalizeSkuCode,
  parsePlatformList,
  parseQuantity,
  shouldCreateQuickEntryInventory,
} from "@/lib/quick-entry-utils";
import { getLatestFxRate } from "@/lib/fx";
import { assertOperationalSku } from "@/lib/application/sku-operability";
import { resolveProductCategory } from "@/lib/application/product-category-service";
import {
  itemConditionReadyForSale,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  validateItemCondition,
} from "@/lib/inventory/item-condition";
import { RESERVING_ALLOCATION_STATUSES } from "@/lib/application/order-allocation";

export type WorkflowStage =
  | "PURCHASE"
  | "LOGISTICS"
  | "INSPECTION"
  | "LISTING"
  | "SOLD"
  | "SHIPPED"
  | "SETTLED"
  | "CLOSED";

export interface QuickEntryRowInput {
  storeId: string;
  existingSkuId?: string;
  sourceType?: string;
  rawBrand?: string;
  rawProductName: string;
  rawVariant?: string;
  rawCategory?: string;
  conditionType?: string;
  conditionGrade?: string;
  functionStatus?: string;
  quantity?: string;
  purchasePrice?: string;
  purchaseCurrency?: string;
  purchasePlatformText?: string;
  purchaseDate?: string;
  purchaseTrackingNo?: string;
  purchaseShippingFee?: string;
  currentLocationText?: string;
  transitTrackingNo?: string;
  transitShippingFee?: string;
  listingPlatformsText?: string;
  salePlatformText?: string;
  saleCurrency?: string;
  salePrice?: string;
  saleShippingFee?: string;
  saleMiscFee?: string;
  salePlatformFeeText?: string;
  saleDate?: string;
  note?: string;
  batchNote?: string;
  inspectionResult?: string;
  inspectionNote?: string;
}

function decimalOrNull(value?: string | null) {
  const text = value?.trim();
  if (!text || text === "/") return null;
  try {
    const decimal = new Decimal(text);
    return decimal.isFinite() ? decimal.toFixed(4) : null;
  } catch {
    return null;
  }
}

function dateOrNull(value?: string | null) {
  const text = value?.trim();
  if (!text || text === "/") return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function entryToInput(entry: QuickEntry): QuickEntryRowInput {
  return {
    storeId: entry.storeId,
    rawBrand: entry.rawBrand ?? undefined,
    rawProductName: entry.rawProductName,
    rawVariant: entry.rawVariant ?? undefined,
    rawCategory: entry.rawCategory ?? undefined,
    conditionType: entry.conditionType ?? undefined,
    conditionGrade: entry.conditionGrade ?? undefined,
    functionStatus: entry.functionStatus ?? undefined,
    quantity: entry.quantity.toString(),
    purchasePrice: entry.purchasePrice?.toString(),
    purchaseCurrency: entry.purchaseCurrency ?? undefined,
    purchasePlatformText: entry.purchasePlatformText ?? undefined,
    purchaseDate: entry.purchaseDate?.toISOString(),
    purchaseTrackingNo: entry.purchaseTrackingNo ?? undefined,
    purchaseShippingFee: entry.purchaseShippingFee?.toString(),
    currentLocationText: entry.currentLocationText ?? undefined,
    transitTrackingNo: entry.transitTrackingNo ?? undefined,
    transitShippingFee: entry.transitShippingFee?.toString(),
    listingPlatformsText: entry.listingPlatformsText ?? undefined,
    salePlatformText: entry.salePlatformText ?? undefined,
    saleCurrency: entry.saleCurrency ?? undefined,
    salePrice: entry.salePrice?.toString(),
    saleShippingFee: entry.saleShippingFee?.toString(),
    saleMiscFee: entry.saleMiscFee?.toString(),
    salePlatformFeeText: entry.salePlatformFeeText ?? undefined,
    saleDate: entry.saleDate?.toISOString(),
    note: entry.note ?? undefined,
    batchNote: entry.batchNote ?? undefined,
    inspectionResult: entry.inspectionResult ?? undefined,
    inspectionNote: entry.inspectionNote ?? undefined,
  };
}

async function resolveLocation(
  tx: Prisma.TransactionClient,
  storeId: string,
  locationText?: string | null
) {
  const text = locationText?.trim();
  if (!text) {
    const fallback = await tx.location.findFirst({
      where: { storeId },
      orderBy: { createdAt: "asc" },
    });
    if (!fallback) throw new Error("请先创建至少一个仓库位置");
    return fallback;
  }

  const locations = await tx.location.findMany({ where: { storeId } });
  const hit =
    locations.find(
      (l) => l.name === text || l.code === text || l.name.includes(text) || text.includes(l.name)
    ) ?? null;

  if (hit) return hit;

  const isTransit = /转运|运输|在途|国际/i.test(text);
  return tx.location.create({
    data: {
      storeId,
      code: `LOC-${Date.now().toString(36)}`,
      name: text,
      type: isTransit ? "TRANSIT" : "WAREHOUSE",
      isSellableDefault: !isTransit,
    },
  });
}

export async function matchOrCreateQuickEntrySku(
  tx: Prisma.TransactionClient,
  storeId: string,
  input: QuickEntryRowInput
) {
  if (input.existingSkuId?.trim()) {
    const sku = await tx.sKU.findFirst({
      where: {
        id: input.existingSkuId.trim(),
        storeId,
        catalogRole: { in: ["SIMPLE", "VARIANT"] },
        OR: [{ mergeStatus: null }, { mergeStatus: { not: "MERGED" } }],
      },
    });
    if (!sku) throw new Error("指定的正式 SKU 不存在、已合并或无权访问");
    return { sku, created: false };
  }
  const name = input.rawProductName.trim();
  const variant = input.rawVariant?.trim();
  const brand = input.rawBrand?.trim();
  const category = input.rawCategory?.trim();
  const supportsCategoryMaster = "store" in tx && "productCategory" in tx;
  const store = supportsCategoryMaster
    ? await tx.store.findUnique({
        where: { id: storeId },
        select: { organizationId: true },
      })
    : null;
  if (supportsCategoryMaster && !store?.organizationId) {
    throw new Error("当前店铺尚未关联经营主体");
  }
  const categoryRecord =
    category && store?.organizationId
      ? await resolveProductCategory({
          organizationId: store.organizationId,
          legacyName: category,
          db: tx,
        })
      : null;

  if (variant) {
    let parent = await tx.sKU.findFirst({
      where: {
        storeId,
        catalogRole: "GROUP",
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (!parent) {
      parent = await tx.sKU.create({
        data: {
          storeId,
          code: await ensureUniqueSkuCode(tx, storeId, normalizeSkuCode(name)),
          name,
          catalogRole: "GROUP",
          variantAxes: ["规格"],
          brand: brand || undefined,
          categoryId: categoryRecord?.id,
          category: categoryRecord?.name ?? category ?? undefined,
          isAutoCreated: true,
          mergeStatus: "PENDING",
        },
      });
    }

    const existingVariant = await tx.sKU.findFirst({
      where: {
        storeId,
        parentSkuId: parent.id,
        catalogRole: "VARIANT",
        variantLabel: { equals: variant, mode: "insensitive" },
      },
    });
    if (existingVariant) return { sku: existingVariant, created: false };

    const codeCandidate = normalizeSkuCode(name, variant);
    const legacySimple = await tx.sKU.findFirst({
      where: {
        storeId,
        catalogRole: "SIMPLE",
        isAutoCreated: true,
        OR: [
          { code: codeCandidate },
          { name: { equals: `${name} ${variant}`, mode: "insensitive" } },
          { name: { equals: `${name} · ${variant}`, mode: "insensitive" } },
        ],
      },
    });

    if (legacySimple) {
      const legacyAttributes =
        legacySimple.attributes &&
        typeof legacySimple.attributes === "object" &&
        !Array.isArray(legacySimple.attributes)
          ? (legacySimple.attributes as Record<string, unknown>)
          : {};
      const sku = await tx.sKU.update({
        where: { id: legacySimple.id },
        data: {
          name: `${name} · ${variant}`,
          parentSkuId: parent.id,
          catalogRole: "VARIANT",
          variantLabel: variant,
          variantValues: { 规格: variant },
          brand: legacySimple.brand || brand || undefined,
          categoryId:
            legacySimple.categoryId || categoryRecord?.id || parent.categoryId || undefined,
          category:
            legacySimple.category ||
            categoryRecord?.name ||
            category ||
            parent.category ||
            undefined,
          attributes: {
            ...legacyAttributes,
            规格: variant,
          } as Prisma.InputJsonValue,
          mergeStatus: "PENDING",
        },
      });
      return { sku, created: true };
    }

    const sku = await tx.sKU.create({
      data: {
        storeId,
        code: await ensureUniqueSkuCode(tx, storeId, codeCandidate),
        name: `${name} · ${variant}`,
        parentSkuId: parent.id,
        catalogRole: "VARIANT",
        variantLabel: variant,
        variantValues: { 规格: variant },
        brand: brand || parent.brand || undefined,
        categoryId: categoryRecord?.id || parent.categoryId || undefined,
        category: categoryRecord?.name || category || parent.category || undefined,
        attributes: { 规格: variant } as Prisma.InputJsonValue,
        isAutoCreated: true,
        mergeStatus: "PENDING",
      },
    });
    return { sku, created: true };
  }

  const existingGroup = await tx.sKU.findFirst({
    where: {
      storeId,
      catalogRole: "GROUP",
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (existingGroup) {
    throw new Error(`「${name}」按规格管理，请填写尺码、颜色或版本等具体规格`);
  }

  const codeCandidate = normalizeSkuCode(name);
  const existing = await tx.sKU.findFirst({
    where: {
      storeId,
      catalogRole: "SIMPLE",
      OR: [{ code: codeCandidate }, { name: { equals: name, mode: "insensitive" } }],
    },
  });
  if (existing) return { sku: existing, created: false };

  const sku = await tx.sKU.create({
    data: {
      storeId,
      code: await ensureUniqueSkuCode(tx, storeId, codeCandidate),
      name,
      catalogRole: "SIMPLE",
      brand: brand || undefined,
      categoryId: categoryRecord?.id,
      category: categoryRecord?.name ?? category ?? undefined,
      isAutoCreated: true,
      mergeStatus: "PENDING",
    },
  });

  return { sku, created: true };
}

async function ensureUniqueSkuCode(tx: Prisma.TransactionClient, storeId: string, base: string) {
  let code = base.slice(0, 48);
  let suffix = 0;
  while (true) {
    const exists = await tx.sKU.findUnique({
      where: { storeId_code: { storeId, code } },
    });
    if (!exists) return code;
    suffix += 1;
    code = `${base.slice(0, 40)}-${suffix}`;
  }
}

async function findOrCreatePurchaseOrder(
  tx: Prisma.TransactionClient,
  params: {
    storeId: string;
    currency: string;
    supplierName?: string;
    purchaseDate?: Date;
    trackingNo?: string;
    destinationLocationId?: string;
    fxRate?: string | null;
    reuseExisting?: boolean;
  }
) {
  const dayStart = params.purchaseDate
    ? new Date(
        params.purchaseDate.getFullYear(),
        params.purchaseDate.getMonth(),
        params.purchaseDate.getDate()
      )
    : null;
  const dayEnd = dayStart
    ? new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 23, 59, 59, 999)
    : null;

  if (params.reuseExisting) {
    const existing = await tx.purchaseOrder.findFirst({
      where: {
        storeId: params.storeId,
        status: { in: ["DRAFT", "ORDERED", "SHIPPED"] },
        currency: params.currency,
        supplierName: params.supplierName || null,
        trackingNo: params.trackingNo || null,
        ...(dayStart && dayEnd ? { orderedAt: { gte: dayStart, lte: dayEnd } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) return existing;
  }

  return tx.purchaseOrder.create({
    data: {
      storeId: params.storeId,
      orderNo: `QE-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`,
      supplierName: params.supplierName,
      currency: params.currency,
      fxRate: params.fxRate,
      subtotal: "0",
      totalAmount: "0",
      status: "ORDERED",
      orderedAt: params.purchaseDate ?? new Date(),
      trackingNo: params.trackingNo,
      destinationLocationId: params.destinationLocationId,
    },
  });
}

async function resolvePlatforms(tx: Prisma.TransactionClient, storeId: string, labels: string[]) {
  const platforms = await tx.platform.findMany({
    where: { storeId },
    include: { salesChannelAccount: { select: { id: true } } },
  });
  const resolved: Array<{
    id: string;
    code: string;
    name: string;
    salesChannelAccountId: string | null;
  }> = [];

  for (const label of labels) {
    const code = matchPlatformCode(label);
    const hit =
      platforms.find(
        (p) =>
          p.code.toLowerCase() === (code ?? "").toLowerCase() ||
          p.name.includes(label) ||
          label.includes(p.name)
      ) ?? null;
    if (hit) {
      resolved.push({
        id: hit.id,
        code: hit.code,
        name: hit.name,
        salesChannelAccountId: hit.salesChannelAccount?.id ?? null,
      });
    }
  }

  return resolved;
}

async function resolvePlatformId(
  tx: Prisma.TransactionClient,
  storeId: string,
  label?: string | null
) {
  const text = label?.trim();
  if (!text) return null;
  const code = matchPlatformCode(text);
  const OR: Prisma.PlatformWhereInput[] = [{ name: { contains: text, mode: "insensitive" } }];
  if (code) OR.push({ code: { equals: code, mode: "insensitive" } });
  return (await tx.platform.findFirst({ where: { storeId, OR } }))?.id ?? null;
}

function parseExistingIds(json: unknown): string[] {
  if (!json) return [];
  if (Array.isArray(json)) return json.map(String);
  return [];
}

function resolveWorkflowStage(entry: QuickEntry): WorkflowStage {
  if (entry.inspectionResult === "FAILED") return "CLOSED";
  if (entry.generatedCustomerOrderId && entry.workflowStage === "SETTLED") return "SETTLED";
  if (entry.generatedCustomerOrderId) return "SOLD";
  if (entry.generatedListingIds) {
    const ids = parseExistingIds(entry.generatedListingIds);
    if (ids.length > 0) return "LISTING";
  }
  if (entry.generatedLotId || entry.generatedItemUnitIds) return "INSPECTION";
  return "PURCHASE";
}

export async function processQuickEntry(entryId: string) {
  let entry = await prisma.quickEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error("快速录入记录不存在");
  if (entry.processedStatus === "COMPLETED" && entry.workflowStage === "SETTLED") {
    return { entryId, status: "COMPLETED" as const };
  }

  await prisma.quickEntry.update({
    where: { id: entryId },
    data: { processedStatus: "PROCESSING", errorMessage: null },
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "quick_entries" WHERE "id" = ${entryId} FOR UPDATE`;
      entry = await tx.quickEntry.findUniqueOrThrow({ where: { id: entryId } });
      const input = entryToInput(entry);
      const qty = parseQuantity(entry.quantity);
      const unitCost = entry.purchasePrice
        ? new Decimal(entry.purchasePrice.toString())
        : new Decimal(0);
      const currency = entry.purchaseCurrency?.trim() || "CNY";
      const receivedAt = entry.purchaseDate ?? new Date();
      const used = isUsedCondition(entry.conditionType);
      const conditionType = normalizeItemConditionType(entry.conditionType);
      const conditionGrade = used
        ? (normalizeUsedItemGrade(entry.conditionGrade) ?? "UNASSESSED")
        : null;
      const functionStatus = normalizeItemFunctionStatus(entry.functionStatus, conditionType);

      let skuId = entry.generatedSkuId;
      let skuCreated = false;
      if (skuId) {
        const generatedSku = await tx.sKU.findUniqueOrThrow({
          where: { id: skuId },
        });
        if (
          input.rawVariant?.trim() &&
          generatedSku.catalogRole === "SIMPLE" &&
          generatedSku.isAutoCreated
        ) {
          const repaired = await matchOrCreateQuickEntrySku(tx, entry.storeId, input);
          skuId = repaired.sku.id;
          skuCreated = repaired.created;
        }
      } else {
        const { sku, created } = await matchOrCreateQuickEntrySku(tx, entry.storeId, input);
        skuId = sku.id;
        skuCreated = created;
      }
      await assertOperationalSku(tx, {
        storeId: entry.storeId,
        skuId: skuId!,
        actionLabel: "快速录入",
      });

      let purchaseOrderId = entry.generatedPurchaseOrderId;
      let purchaseLineId = entry.generatedPurchaseLineId;

      if (unitCost.gt(0) && !purchaseLineId) {
        const store = await tx.store.findUniqueOrThrow({
          where: { id: entry.storeId },
          select: { currency: true },
        });
        let fxRate: string | null = null;
        if (currency !== store.currency) {
          const rate = await getLatestFxRate(currency, store.currency, receivedAt);
          if (rate) fxRate = rate.toFixed(8);
        }

        const destinationLocationId = entry.currentLocationText?.trim()
          ? (await resolveLocation(tx, entry.storeId, entry.currentLocationText)).id
          : undefined;
        const po = purchaseOrderId
          ? await tx.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } })
          : await findOrCreatePurchaseOrder(tx, {
              storeId: entry.storeId,
              currency,
              supplierName: entry.purchasePlatformText?.trim(),
              purchaseDate: entry.purchaseDate ?? undefined,
              trackingNo: entry.purchaseTrackingNo?.trim(),
              destinationLocationId,
              fxRate,
              reuseExisting: false,
            });
        purchaseOrderId = po.id;

        if (
          (!po.trackingNo && entry.purchaseTrackingNo?.trim()) ||
          (!po.destinationLocationId && destinationLocationId)
        ) {
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: {
              trackingNo: po.trackingNo ?? entry.purchaseTrackingNo?.trim() ?? undefined,
              destinationLocationId: po.destinationLocationId ?? destinationLocationId,
            },
          });
        }

        const lineAmount = qty.times(unitCost);
        const line = await tx.purchaseLine.create({
          data: {
            purchaseOrderId: po.id,
            skuId: skuId!,
            quantity: qty.toFixed(4),
            unitPrice: unitCost.toFixed(4),
            lineAmount: lineAmount.toFixed(4),
            trackingMode: used ? "ITEM_UNIT" : "LOT",
          },
        });
        purchaseLineId = line.id;

        const lines = await tx.purchaseLine.findMany({
          where: { purchaseOrderId: po.id },
        });
        const subtotal = lines.reduce(
          (sum, l) => sum.plus(new Decimal(l.lineAmount.toString())),
          new Decimal(0)
        );
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: {
            subtotal: subtotal.toFixed(4),
            totalAmount: subtotal.toFixed(4),
          },
        });

        if (entry.purchaseShippingFee && new Decimal(entry.purchaseShippingFee.toString()).gt(0)) {
          const existingFee = await tx.fee.findFirst({
            where: {
              refType: "PURCHASE_ORDER",
              refId: po.id,
              feeType: "SHIPPING_COST",
            },
          });
          if (!existingFee) {
            await tx.fee.create({
              data: {
                refType: "PURCHASE_ORDER",
                refId: po.id,
                feeType: "SHIPPING_COST",
                amount: entry.purchaseShippingFee.toString(),
                currency,
              },
            });
          }
        }
      }

      let workflowStage: WorkflowStage = "PURCHASE";

      let lotId = entry.generatedLotId;
      const itemUnitIds = parseExistingIds(entry.generatedItemUnitIds);

      const inspectionFailed = entry.inspectionResult === "FAILED";
      const canInspect = !inspectionFailed && shouldCreateQuickEntryInventory(entry);

      if (inspectionFailed) {
        await tx.inspectionEvent.create({
          data: {
            storeId: entry.storeId,
            refType: "QUICK_ENTRY",
            refId: entryId,
            result: "FAILED",
            failureReason: entry.inspectionNote ?? entry.note ?? "检查不合格",
            inspectedAt: entry.inspectedAt ?? new Date(),
          },
        });
        workflowStage = "CLOSED";
      } else if (canInspect && !lotId && itemUnitIds.length === 0 && unitCost.gt(0)) {
        const conditionError = validateItemCondition({
          conditionType,
          conditionGrade,
          functionStatus,
          notes: [entry.batchNote, entry.note].filter(Boolean).join(" / "),
        });
        if (conditionError) {
          throw new Error(conditionError);
        }

        const location = await resolveLocation(tx, entry.storeId, entry.currentLocationText);
        const notes = [entry.batchNote, entry.note].filter(Boolean).join(" / ") || undefined;

        if (used) {
          const count = Math.max(1, qty.toDecimalPlaces(0, Decimal.ROUND_DOWN).toNumber());
          for (let i = 0; i < count; i++) {
            if (itemUnitIds.length >= count) break;
            const item = await createInboundItemUnit(tx, {
              storeId: entry.storeId,
              skuId: skuId!,
              locationId: location.id,
              unitCost: unitCost.toFixed(4),
              costCurrency: currency,
              conditionType,
              conditionGrade: conditionGrade ?? undefined,
              functionStatus,
              notes,
              batchLabel: entry.batchNote ?? undefined,
              sourceType: "QUICK_ENTRY",
              sourceId: entryId,
              receivedAt,
              refType: "QUICK_ENTRY",
              refId: entryId,
              status: itemConditionReadyForSale({
                conditionType,
                conditionGrade,
                functionStatus,
                notes,
                photoCount: 0,
              })
                ? "AVAILABLE"
                : "RETURN_CHECK",
            });
            itemUnitIds.push(item.id);
          }
        } else {
          const lot = await createInboundInventoryLot(tx, {
            storeId: entry.storeId,
            skuId: skuId!,
            locationId: location.id,
            quantity: qty.toFixed(4),
            unitCost: unitCost.toFixed(4),
            costCurrency: currency,
            sourceType: "QUICK_ENTRY",
            sourceId: entryId,
            receivedAt,
            refType: "QUICK_ENTRY",
            refId: entryId,
            meta: {
              quickEntryId: entryId,
              purchaseLineId,
              batchLabel: entry.batchNote ?? undefined,
            },
          });
          lotId = lot.id;
        }

        if (purchaseOrderId) {
          await tx.purchaseOrder.update({
            where: { id: purchaseOrderId },
            data: { status: "RECEIVED", receivedAt },
          });
        }

        await tx.inspectionEvent.create({
          data: {
            storeId: entry.storeId,
            refType: "QUICK_ENTRY",
            refId: entryId,
            locationId: (await resolveLocation(tx, entry.storeId, entry.currentLocationText)).id,
            result: "PASSED",
            inspectedAt: entry.inspectedAt ?? new Date(),
          },
        });

        workflowStage = "INSPECTION";
      }

      const existingListingIds = parseExistingIds(entry.generatedListingIds);
      const listingIds = [...existingListingIds];
      const platformLabels = parsePlatformList(entry.listingPlatformsText);
      const platforms = await resolvePlatforms(tx, entry.storeId, platformLabels);
      const usedItemsReady =
        !used ||
        itemUnitIds.length === 0 ||
        (await tx.itemUnit.count({
          where: { id: { in: itemUnitIds }, status: "AVAILABLE" },
        })) === itemUnitIds.length;

      if ((lotId || itemUnitIds.length > 0) && platforms.length > 0 && usedItemsReady) {
        for (const platform of platforms) {
          const dupWhere: Prisma.ListingWhereInput = {
            storeId: entry.storeId,
            platformId: platform.id,
            status: "ACTIVE",
            ...(used && itemUnitIds[0] ? { itemUnitId: itemUnitIds[0] } : { skuId: skuId! }),
          };
          const dup = await tx.listing.findFirst({ where: dupWhere });
          if (dup) {
            if (!listingIds.includes(dup.id)) listingIds.push(dup.id);
            continue;
          }

          const listing = await tx.listing.create({
            data: {
              storeId: entry.storeId,
              salesChannelAccountId: platform.salesChannelAccountId,
              platformId: platform.id,
              listingType: used && itemUnitIds[0] ? "ITEM_UNIT" : "SKU",
              skuId: used && itemUnitIds[0] ? undefined : skuId!,
              itemUnitId: used && itemUnitIds[0] ? itemUnitIds[0] : undefined,
              currency,
              status: "ACTIVE",
              listedAt: new Date(),
            },
          });
          listingIds.push(listing.id);
        }
        if (listingIds.length > 0) workflowStage = "LISTING";
      }

      let customerOrderId = entry.generatedCustomerOrderId;
      let orderLineId = entry.generatedOrderLineId;

      if (
        entry.salePrice &&
        new Decimal(entry.salePrice.toString()).gt(0) &&
        !customerOrderId &&
        (lotId || itemUnitIds.length > 0) &&
        usedItemsReady
      ) {
        const salePrice = new Decimal(entry.salePrice.toString());
        const saleCurrency = entry.saleCurrency?.trim() || currency;
        const saleQty = used && itemUnitIds.length > 0 ? new Decimal(1) : qty;
        const lineAmount = salePrice.times(saleQty);
        const salePlatformId = await resolvePlatformId(tx, entry.storeId, entry.salePlatformText);

        const platform = salePlatformId
          ? await tx.platform.findUnique({
              where: { id: salePlatformId },
              include: { salesChannelAccount: { select: { id: true } } },
            })
          : null;
        const feeRate = platform?.defaultFeeRate
          ? new Decimal(platform.defaultFeeRate.toString())
          : null;
        const platformFee = parseFeeText(entry.salePlatformFeeText, lineAmount);
        const shippingFee = entry.saleShippingFee
          ? new Decimal(entry.saleShippingFee.toString())
          : new Decimal(0);
        const miscFee = entry.saleMiscFee
          ? new Decimal(entry.saleMiscFee.toString())
          : new Decimal(0);

        // A quick-entry sale shares the same physical stock with normal,
        // bundle and fulfillment reservations. Use the same SKU-first lock
        // order and re-check both allocation tables before writing a sale.
        await tx.$queryRaw`SELECT "id" FROM "skus" WHERE "id" = ${skuId!} FOR UPDATE`;
        let inventoryCost = new Decimal(0);
        if (used && itemUnitIds[0]) {
          await tx.$queryRaw`SELECT "id" FROM "item_units" WHERE "id" = ${itemUnitIds[0]} FOR UPDATE`;
          const item = await tx.itemUnit.findUniqueOrThrow({
            where: { id: itemUnitIds[0] },
          });
          if (
            item.storeId !== entry.storeId ||
            item.skuId !== skuId ||
            item.status !== "AVAILABLE" ||
            item.costStatus !== "CONFIRMED"
          ) {
            throw new Error("快速录入关联的单件库存已不可售");
          }
          const [orderReservation, fulfillmentReservation] = await Promise.all([
            tx.orderAllocation.findFirst({
              where: {
                itemUnitId: item.id,
                status: { in: [...RESERVING_ALLOCATION_STATUSES] },
              },
              select: { id: true },
            }),
            tx.fulfillmentInventoryAllocation.findFirst({
              where: { itemUnitId: item.id, status: "ALLOCATED" },
              select: { id: true },
            }),
          ]);
          if (orderReservation || fulfillmentReservation) {
            throw new Error("快速录入关联的单件库存已被其他订单预留");
          }
          inventoryCost = new Decimal(item.unitCost.toString());
        } else if (lotId) {
          await tx.$queryRaw`SELECT "id" FROM "inventory_lots" WHERE "id" = ${lotId} FOR UPDATE`;
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
          if (
            lot.storeId !== entry.storeId ||
            lot.skuId !== skuId ||
            lot.status !== "ACTIVE" ||
            lot.costStatus !== "CONFIRMED"
          ) {
            throw new Error("快速录入关联的批次库存已不可售");
          }
          const [ledger, orderReservations, fulfillmentReservations] = await Promise.all([
            tx.stockLedger.aggregate({
              where: { entityType: "LOT", entityId: lot.id, locationId: lot.locationId },
              _sum: { deltaQty: true },
            }),
            tx.orderAllocation.aggregate({
              where: {
                lotId: lot.id,
                status: { in: [...RESERVING_ALLOCATION_STATUSES] },
              },
              _sum: { quantity: true },
            }),
            tx.fulfillmentInventoryAllocation.aggregate({
              where: { lotId: lot.id, status: "ALLOCATED" },
              _sum: { quantity: true },
            }),
          ]);
          const available = new Decimal(ledger._sum.deltaQty?.toString() ?? 0)
            .minus(orderReservations._sum.quantity?.toString() ?? 0)
            .minus(fulfillmentReservations._sum.quantity?.toString() ?? 0);
          if (available.lt(saleQty)) {
            throw new Error("快速录入关联的批次库存已被占用或数量不足");
          }
          inventoryCost = new Decimal(lot.unitCost.toString()).times(saleQty);
        }

        const fees = computeOrderFees({
          subtotal: lineAmount,
          platformFeeAmount: platformFee,
          platformFeeRate: feeRate,
          shippingFee,
          miscFee,
          inventoryCost,
        });
        const feeStrings = feeResultToStrings(fees);

        const order = await tx.customerOrder.create({
          data: {
            storeId: entry.storeId,
            salesChannelAccountId: platform?.salesChannelAccount?.id,
            orderNumber: `QE-SALE-${entryId.slice(-8).toUpperCase()}-${Date.now().toString(36)}`,
            platformId: salePlatformId,
            customerName: "快速录入客户",
            orderDate: entry.saleDate ?? new Date(),
            currency: saleCurrency,
            subtotal: lineAmount.toFixed(4),
            totalPaid: lineAmount.toFixed(4),
            platformFee: feeStrings.platformFee,
            shippingFee: feeStrings.shippingFee,
            shippingFeeStatus: entry.saleShippingFee !== null ? "ESTIMATED" : "PENDING",
            netRevenue: feeStrings.netRevenue,
            orderStatus: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });
        customerOrderId = order.id;

        const orderLine = await tx.orderLine.create({
          data: {
            orderId: order.id,
            skuId: skuId!,
            quantity: saleQty.toFixed(4),
            unitPrice: salePrice.toFixed(4),
            lineAmount: lineAmount.toFixed(4),
            supplyStatus: "READY_TO_SHIP",
          },
        });
        orderLineId = orderLine.id;

        if (used && itemUnitIds[0]) {
          const item = await tx.itemUnit.findUniqueOrThrow({
            where: { id: itemUnitIds[0] },
          });
          await tx.orderAllocation.create({
            data: {
              orderLineId: orderLine.id,
              allocationType: "ITEM_UNIT",
              itemUnitId: item.id,
              quantity: "1",
              unitCost: item.unitCost,
              costAmount: item.unitCost,
              costCurrency: item.costCurrency,
              costSourceType: item.sourceType,
              costSourceId: item.sourceId,
              status: "PENDING",
            },
          });
        } else if (lotId) {
          const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: lotId } });
          const costAmount = new Decimal(lot.unitCost.toString()).times(saleQty);
          await tx.orderAllocation.create({
            data: {
              orderLineId: orderLine.id,
              allocationType: "LOT",
              lotId,
              quantity: saleQty.toFixed(4),
              unitCost: lot.unitCost,
              costAmount: costAmount.toFixed(4),
              costCurrency: lot.costCurrency,
              costSourceType: lot.sourceType,
              costSourceId: lot.sourceId,
              status: "PENDING",
            },
          });
        }

        workflowStage = "SOLD";
      }

      const incomplete = detectIncompleteFields({
        purchasePrice: entry.purchasePrice ? new Decimal(entry.purchasePrice.toString()) : null,
        currentLocationText: entry.currentLocationText,
        salePrice: entry.salePrice ? new Decimal(entry.salePrice.toString()) : null,
        isAutoCreatedSku: skuCreated,
        purchaseCurrency: entry.purchaseCurrency,
        inspectionResult: entry.inspectionResult,
      });
      if (used && itemUnitIds.length > 0 && !usedItemsReady) {
        incomplete.push("incomplete_item_condition");
      }

      if (inspectionFailed) {
        incomplete.length = 0;
      }

      const status = inspectionFailed || incomplete.length === 0 ? "COMPLETED" : "PARTIAL";
      workflowStage = resolveWorkflowStage({
        ...entry,
        generatedSkuId: skuId,
        generatedLotId: lotId,
        generatedItemUnitIds: itemUnitIds.length ? itemUnitIds : entry.generatedItemUnitIds,
        generatedListingIds: listingIds.length ? listingIds : entry.generatedListingIds,
        generatedCustomerOrderId: customerOrderId,
        inspectionResult: entry.inspectionResult,
        workflowStage,
      });

      await tx.quickEntry.update({
        where: { id: entryId },
        data: {
          processedStatus: status,
          processedAt: new Date(),
          workflowStage,
          generatedSkuId: skuId,
          generatedLotId: lotId,
          generatedItemUnitIds: itemUnitIds.length ? itemUnitIds : undefined,
          generatedPurchaseOrderId: purchaseOrderId,
          generatedPurchaseLineId: purchaseLineId,
          generatedListingIds: listingIds.length ? listingIds : undefined,
          generatedCustomerOrderId: customerOrderId,
          generatedOrderLineId: orderLineId,
          errorMessage: incomplete.length ? `待补全: ${incomplete.join(", ")}` : null,
        },
      });

      return {
        skuId,
        lotId,
        itemUnitIds,
        purchaseOrderId,
        listingIds,
        customerOrderId,
        orderLineId,
        status,
        workflowStage,
      };
    });

    return { entryId, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败";
    await prisma.quickEntry.update({
      where: { id: entryId },
      data: {
        processedStatus: "FAILED",
        processedAt: new Date(),
        errorMessage: message,
      },
    });
    throw error;
  }
}

export async function createAndProcessQuickEntry(input: QuickEntryRowInput) {
  const qty = parseQuantity(input.quantity);
  const conditionType = normalizeItemConditionType(input.conditionType);
  if (conditionType === "USED" && !qty.eq(1)) {
    throw new Error("中古单件必须每件独立一行录入");
  }
  const conditionGrade =
    conditionType === "USED"
      ? (normalizeUsedItemGrade(input.conditionGrade) ?? "UNASSESSED")
      : null;
  const functionStatus = normalizeItemFunctionStatus(input.functionStatus, conditionType);
  const conditionError = validateItemCondition({
    conditionType,
    conditionGrade,
    functionStatus,
    notes: [input.batchNote, input.note].filter(Boolean).join(" / "),
  });
  if (conditionError) throw new Error(conditionError);
  const entry = await prisma.quickEntry.create({
    data: {
      storeId: input.storeId,
      sourceType: input.sourceType ?? "MANUAL",
      rawBrand: input.rawBrand?.trim(),
      rawProductName: input.rawProductName.trim(),
      rawVariant: input.rawVariant?.trim(),
      rawCategory: input.rawCategory?.trim(),
      conditionType,
      conditionGrade,
      functionStatus,
      quantity: qty.toFixed(4),
      purchasePrice: decimalOrNull(input.purchasePrice),
      purchaseCurrency: input.purchaseCurrency?.trim() || "CNY",
      purchasePlatformText: input.purchasePlatformText?.trim(),
      purchaseDate: dateOrNull(input.purchaseDate) ?? new Date(),
      purchaseTrackingNo: input.purchaseTrackingNo?.trim(),
      purchaseShippingFee: decimalOrNull(input.purchaseShippingFee),
      currentLocationText: input.currentLocationText?.trim(),
      transitTrackingNo: input.transitTrackingNo?.trim(),
      transitShippingFee: decimalOrNull(input.transitShippingFee),
      listingPlatformsText: input.listingPlatformsText?.trim(),
      salePlatformText: input.salePlatformText?.trim(),
      saleCurrency: input.saleCurrency?.trim(),
      salePrice: decimalOrNull(input.salePrice),
      saleShippingFee: decimalOrNull(input.saleShippingFee),
      saleMiscFee: decimalOrNull(input.saleMiscFee),
      salePlatformFeeText: input.salePlatformFeeText?.trim(),
      saleDate: dateOrNull(input.saleDate),
      note: input.note?.trim(),
      batchNote: input.batchNote?.trim(),
      inspectionResult: input.inspectionResult?.trim(),
      inspectionNote: input.inspectionNote?.trim(),
      workflowStage: "PURCHASE",
      generatedSkuId: input.existingSkuId?.trim() || undefined,
    },
  });

  return processQuickEntry(entry.id);
}

export async function createGroupedPurchaseQuickEntries(rows: QuickEntryRowInput[]) {
  if (rows.length < 2) {
    throw new Error("至少选择两条记录才能合并采购单");
  }

  const storeId = rows[0]?.storeId;
  const currency = rows[0]?.purchaseCurrency?.trim() || "CNY";
  const supplierName = rows[0]?.purchasePlatformText?.trim();
  if (!storeId) throw new Error("缺少店铺信息");
  if (!supplierName) throw new Error("合并采购单需要填写供应商");

  for (const row of rows) {
    if (row.storeId !== storeId) throw new Error("只能合并同一店铺的录入行");
    if (!row.rawProductName?.trim()) throw new Error("合并采购单的商品名不能为空");
    if ((row.purchaseCurrency?.trim() || "CNY") !== currency) {
      throw new Error("合并采购单要求币种一致");
    }
    if ((row.purchasePlatformText?.trim() || "") !== supplierName) {
      throw new Error("合并采购单要求供应商一致");
    }
    const price = decimalOrNull(row.purchasePrice);
    if (!price || new Decimal(price).lte(0)) {
      throw new Error(`「${row.rawProductName}」缺少有效购入价`);
    }
    const conditionType = normalizeItemConditionType(row.conditionType);
    if (conditionType === "USED" && !parseQuantity(row.quantity).eq(1)) {
      throw new Error(`「${row.rawProductName}」为中古单件，请拆成独立一行录入`);
    }
    const conditionGrade =
      conditionType === "USED"
        ? (normalizeUsedItemGrade(row.conditionGrade) ?? "UNASSESSED")
        : null;
    const functionStatus = normalizeItemFunctionStatus(row.functionStatus, conditionType);
    const conditionError = validateItemCondition({
      conditionType,
      conditionGrade,
      functionStatus,
      notes: [row.batchNote, row.note].filter(Boolean).join(" / "),
    });
    if (conditionError) throw new Error(`「${row.rawProductName}」：${conditionError}`);
  }

  return prisma.$transaction(async (tx) => {
    const store = await tx.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { currency: true },
    });
    const purchaseDate = dateOrNull(rows[0]?.purchaseDate) ?? new Date();
    let fxRate: string | null = null;
    if (currency !== store.currency) {
      const rate = await getLatestFxRate(currency, store.currency, purchaseDate);
      if (rate) fxRate = rate.toFixed(8);
    }

    const po = await findOrCreatePurchaseOrder(tx, {
      storeId,
      currency,
      supplierName,
      purchaseDate,
      fxRate,
      reuseExisting: false,
    });

    const entryIds: string[] = [];
    const lineIds: string[] = [];
    const skuIds: string[] = [];

    for (const row of rows) {
      const qty = parseQuantity(row.quantity);
      const unitCost = new Decimal(decimalOrNull(row.purchasePrice)!);
      const { sku } = await matchOrCreateQuickEntrySku(tx, storeId, row);
      const entry = await tx.quickEntry.create({
        data: {
          storeId,
          sourceType: row.sourceType ?? "MANUAL",
          rawBrand: row.rawBrand?.trim(),
          rawProductName: row.rawProductName.trim(),
          rawVariant: row.rawVariant?.trim(),
          rawCategory: row.rawCategory?.trim(),
          conditionType: normalizeItemConditionType(row.conditionType),
          conditionGrade:
            normalizeItemConditionType(row.conditionType) === "USED"
              ? (normalizeUsedItemGrade(row.conditionGrade) ?? "UNASSESSED")
              : null,
          functionStatus: normalizeItemFunctionStatus(
            row.functionStatus,
            normalizeItemConditionType(row.conditionType)
          ),
          quantity: qty.toFixed(4),
          purchasePrice: unitCost.toFixed(4),
          purchaseCurrency: currency,
          purchasePlatformText: supplierName,
          purchaseDate,
          purchaseShippingFee: decimalOrNull(row.purchaseShippingFee),
          currentLocationText: row.currentLocationText?.trim(),
          listingPlatformsText: row.listingPlatformsText?.trim(),
          salePlatformText: row.salePlatformText?.trim(),
          saleCurrency: row.saleCurrency?.trim(),
          salePrice: decimalOrNull(row.salePrice),
          saleShippingFee: decimalOrNull(row.saleShippingFee),
          saleMiscFee: decimalOrNull(row.saleMiscFee),
          salePlatformFeeText: row.salePlatformFeeText?.trim(),
          saleDate: dateOrNull(row.saleDate),
          note: row.note?.trim(),
          batchNote: row.batchNote?.trim(),
          workflowStage: "PURCHASE",
          processedStatus: "PROCESSING",
          generatedSkuId: row.existingSkuId?.trim() || undefined,
        },
      });

      const lineAmount = qty.times(unitCost);
      const line = await tx.purchaseLine.create({
        data: {
          purchaseOrderId: po.id,
          skuId: sku.id,
          quantity: qty.toFixed(4),
          unitPrice: unitCost.toFixed(4),
          lineAmount: lineAmount.toFixed(4),
          trackingMode: isUsedCondition(row.conditionType) ? "ITEM_UNIT" : "LOT",
        },
      });

      await tx.quickEntry.update({
        where: { id: entry.id },
        data: {
          processedStatus: "PARTIAL",
          processedAt: new Date(),
          workflowStage: "PURCHASE",
          generatedSkuId: sku.id,
          generatedPurchaseOrderId: po.id,
          generatedPurchaseLineId: line.id,
          errorMessage: "待补物流",
        },
      });

      entryIds.push(entry.id);
      lineIds.push(line.id);
      skuIds.push(sku.id);
    }

    const lines = await tx.purchaseLine.findMany({
      where: { purchaseOrderId: po.id },
    });
    const subtotal = lines.reduce(
      (sum, line) => sum.plus(new Decimal(line.lineAmount.toString())),
      new Decimal(0)
    );
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        subtotal: subtotal.toFixed(4),
        totalAmount: subtotal.toFixed(4),
      },
    });

    return { purchaseOrderId: po.id, entryIds, lineIds, skuIds };
  });
}

export async function updateAndProcessQuickEntry(
  entryId: string,
  input: Partial<QuickEntryRowInput>
) {
  const existing = await prisma.quickEntry.findUnique({ where: { id: entryId } });
  if (!existing) throw new Error("快速录入记录不存在");

  const conditionType = normalizeItemConditionType(input.conditionType ?? existing.conditionType);
  const conditionGrade =
    conditionType === "USED"
      ? (normalizeUsedItemGrade(input.conditionGrade ?? existing.conditionGrade) ?? "UNASSESSED")
      : null;
  const functionStatus = normalizeItemFunctionStatus(
    input.functionStatus ?? existing.functionStatus,
    conditionType
  );
  const nextNotes = [input.batchNote ?? existing.batchNote, input.note ?? existing.note]
    .filter(Boolean)
    .join(" / ");
  const conditionError = validateItemCondition({
    conditionType,
    conditionGrade,
    functionStatus,
    notes: nextNotes,
  });
  if (conditionError) throw new Error(conditionError);

  await prisma.quickEntry.update({
    where: { id: entryId },
    data: {
      rawBrand: input.rawBrand?.trim() ?? existing.rawBrand,
      rawProductName: input.rawProductName?.trim() ?? existing.rawProductName,
      rawVariant: input.rawVariant?.trim() ?? existing.rawVariant,
      rawCategory: input.rawCategory?.trim() ?? existing.rawCategory,
      conditionType,
      conditionGrade,
      functionStatus,
      quantity: input.quantity ? parseQuantity(input.quantity).toFixed(4) : existing.quantity,
      purchasePrice:
        input.purchasePrice !== undefined
          ? decimalOrNull(input.purchasePrice)
          : existing.purchasePrice,
      purchaseCurrency: input.purchaseCurrency?.trim() ?? existing.purchaseCurrency,
      purchasePlatformText: input.purchasePlatformText?.trim() ?? existing.purchasePlatformText,
      purchaseDate:
        input.purchaseDate !== undefined ? dateOrNull(input.purchaseDate) : existing.purchaseDate,
      purchaseTrackingNo: input.purchaseTrackingNo?.trim() ?? existing.purchaseTrackingNo,
      purchaseShippingFee:
        input.purchaseShippingFee !== undefined
          ? decimalOrNull(input.purchaseShippingFee)
          : existing.purchaseShippingFee,
      currentLocationText: input.currentLocationText?.trim() ?? existing.currentLocationText,
      transitTrackingNo: input.transitTrackingNo?.trim() ?? existing.transitTrackingNo,
      transitShippingFee:
        input.transitShippingFee !== undefined
          ? decimalOrNull(input.transitShippingFee)
          : existing.transitShippingFee,
      listingPlatformsText: input.listingPlatformsText?.trim() ?? existing.listingPlatformsText,
      salePlatformText: input.salePlatformText?.trim() ?? existing.salePlatformText,
      saleCurrency: input.saleCurrency?.trim() ?? existing.saleCurrency,
      salePrice:
        input.salePrice !== undefined ? decimalOrNull(input.salePrice) : existing.salePrice,
      saleShippingFee:
        input.saleShippingFee !== undefined
          ? decimalOrNull(input.saleShippingFee)
          : existing.saleShippingFee,
      saleMiscFee:
        input.saleMiscFee !== undefined ? decimalOrNull(input.saleMiscFee) : existing.saleMiscFee,
      salePlatformFeeText: input.salePlatformFeeText?.trim() ?? existing.salePlatformFeeText,
      saleDate: input.saleDate !== undefined ? dateOrNull(input.saleDate) : existing.saleDate,
      note: input.note?.trim() ?? existing.note,
      batchNote: input.batchNote?.trim() ?? existing.batchNote,
      inspectionResult: input.inspectionResult?.trim() ?? existing.inspectionResult,
      inspectionNote: input.inspectionNote?.trim() ?? existing.inspectionNote,
      generatedSkuId: input.existingSkuId?.trim() ?? existing.generatedSkuId,
      inspectedAt:
        input.inspectionResult && input.inspectionResult !== existing.inspectionResult
          ? new Date()
          : existing.inspectedAt,
      processedStatus: "PENDING",
    },
  });

  return processQuickEntry(entryId);
}

export async function inspectQuickEntry(
  entryId: string,
  result: "PASSED" | "FAILED",
  note?: string
) {
  return updateAndProcessQuickEntry(entryId, {
    inspectionResult: result,
    inspectionNote: note,
  });
}

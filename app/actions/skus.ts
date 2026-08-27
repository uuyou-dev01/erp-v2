"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import {
  mergeSkuCatalogAttributes,
  parseSkuCatalogMeta,
  resolveCoverImageUrl,
  type CatalogStatus,
} from "@/lib/application/sku-catalog";
import { requireUserContext } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { resolveProductCategory } from "@/lib/application/product-category-service";
import {
  buildSkuDisplayName,
  deriveCatalogRole,
  generateSkuCodeCandidate,
  normalizeCatalogRole,
  normalizeManufacturerCode,
  normalizeIdentitySourceValue,
  normalizeVariantLabel,
  type SkuCatalogRole,
  type SkuIdentitySource,
} from "@/lib/application/sku-identity";

export interface CreateSKUInput {
  storeId: string;
  code?: string;
  name?: string;
  catalogRole?: SkuCatalogRole;
  manufacturerCode?: string;
  variantLabel?: string;
  variantAxes?: string[];
  variantValues?: Record<string, string>;
  nameSource?: SkuIdentitySource;
  codeSource?: SkuIdentitySource;
  parentSkuId?: string | null;
  categoryId?: string | null;
  category?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  description?: string;
  imageUrl?: string;
}

export interface UpdateSKUInput extends CreateSKUInput {
  id: string;
}

export interface UpdateSkuQuickInfoInput {
  id: string;
  name: string;
  categoryId?: string | null;
  category?: string | null;
  brand?: string | null;
  syncMissingVariantInfo?: boolean;
}

export type SkuStructureConversionInput =
  | {
      skuId: string;
      mode: "SIMPLE_TO_GROUP";
      groupName: string;
      variantLabel: string;
      axisName?: string;
    }
  | {
      skuId: string;
      mode: "GROUP_TO_SIMPLE";
      simpleName: string;
    };

export async function getSKUParentOptions(storeId: string, excludeId?: string) {
  const context = await requireUserContext({ storeId });
  return await prisma.sKU.findMany({
    where: {
      storeId: context.activeStoreId,
      id: excludeId ? { not: excludeId } : undefined,
      OR: [{ catalogRole: "GROUP" }, { parentSkuId: null, childSkus: { some: {} } }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      catalogRole: true,
      manufacturerCode: true,
      variantAxes: true,
      categoryId: true,
      category: true,
      brand: true,
      imageUrl: true,
      attributes: true,
      _count: { select: { childSkus: true } },
    },
    orderBy: { code: "asc" },
  });
}

export async function getSKUs(storeId: string) {
  const context = await requireUserContext({ storeId });
  const skus = await prisma.sKU.findMany({
    where: { storeId: context.activeStoreId },
    include: {
      parentSku: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      childSkus: {
        select: {
          id: true,
        },
      },
      inventoryLots: {
        select: {
          id: true,
          status: true,
        },
      },
      itemUnits: {
        select: {
          id: true,
          status: true,
        },
      },
      listings: {
        select: {
          status: true,
        },
      },
      _count: {
        select: {
          inventoryLots: true,
          itemUnits: true,
          listings: true,
          orderLines: true,
          purchaseLines: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const lotIds = skus.flatMap((sku) => sku.inventoryLots.map((lot) => lot.id));
  const ledgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
          select: {
            entityId: true,
            deltaQty: true,
          },
        })
      : [];

  const lotQuantityById = ledgers.reduce<Record<string, Decimal>>((acc, ledger) => {
    acc[ledger.entityId] = (acc[ledger.entityId] ?? new Decimal(0)).plus(
      new Decimal(ledger.deltaQty.toString())
    );
    return acc;
  }, {});

  return skus.map((sku) => {
    const availableLotQuantity = sku.inventoryLots.reduce((sum, lot) => {
      return sum.plus(lotQuantityById[lot.id] ?? new Decimal(0));
    }, new Decimal(0));
    const availableItemUnits = sku.itemUnits.filter((item) => item.status === "AVAILABLE").length;
    const activeListings = sku.listings.filter((listing) => listing.status === "ACTIVE").length;

    return {
      ...sku,
      businessSummary: {
        availableLotQuantity: availableLotQuantity.toString(),
        availableItemUnits,
        activeListings,
        purchaseLineCount: sku._count.purchaseLines,
        salesLineCount: sku._count.orderLines,
        hasAvailableStock: availableLotQuantity.gt(0) || availableItemUnits > 0,
      },
    };
  });
}

const VALID_SALES_STATUSES = ["CONFIRMED", "SHIPPED", "DELIVERED"];

function computeSalesMetrics(
  lines: Array<{
    quantity: { toString(): string };
    lineAmount: { toString(): string };
    orderId: string;
    order: {
      subtotal: { toString(): string };
      platformFee: { toString(): string };
      shippingFee: { toString(): string };
    };
    allocations: Array<{ costAmount: { toString(): string } }>;
  }>
) {
  let totalQuantity = new Decimal(0);
  let totalRevenue = new Decimal(0);
  let totalPlatformFee = new Decimal(0);
  let totalShippingFee = new Decimal(0);
  let totalInventoryCost = new Decimal(0);
  const unitPrices: Decimal[] = [];
  const orderIds = new Set<string>();

  for (const line of lines) {
    const qty = new Decimal(line.quantity.toString());
    const lineAmt = new Decimal(line.lineAmount.toString());
    totalQuantity = totalQuantity.plus(qty);
    totalRevenue = totalRevenue.plus(lineAmt);
    orderIds.add(line.orderId);

    if (qty.gt(0)) {
      unitPrices.push(lineAmt.div(qty));
    }

    const orderSubtotal = new Decimal(line.order.subtotal.toString());
    if (orderSubtotal.gt(0)) {
      const share = lineAmt.div(orderSubtotal);
      totalPlatformFee = totalPlatformFee.plus(
        new Decimal(line.order.platformFee.toString()).mul(share)
      );
      totalShippingFee = totalShippingFee.plus(
        new Decimal(line.order.shippingFee.toString()).mul(share)
      );
    }

    const lineCost = line.allocations.reduce(
      (sum, alloc) => sum.plus(new Decimal(alloc.costAmount.toString())),
      new Decimal(0)
    );
    totalInventoryCost = totalInventoryCost.plus(lineCost);
  }

  const grossProfit = totalRevenue
    .minus(totalPlatformFee)
    .minus(totalShippingFee)
    .minus(totalInventoryCost);
  const profitRate = totalRevenue.gt(0) ? grossProfit.div(totalRevenue).mul(100) : new Decimal(0);
  const avgUnitProfit = totalQuantity.gt(0) ? grossProfit.div(totalQuantity) : new Decimal(0);

  return {
    totalQuantity: totalQuantity.toString(),
    totalRevenue: totalRevenue.toFixed(2),
    orderCount: orderIds.size,
    totalPlatformFee: totalPlatformFee.toFixed(2),
    totalShippingFee: totalShippingFee.toFixed(2),
    totalInventoryCost: totalInventoryCost.toFixed(2),
    grossProfit: grossProfit.toFixed(2),
    profitRate: profitRate.toFixed(1),
    avgUnitProfit: avgUnitProfit.toFixed(2),
    avgUnitPrice:
      unitPrices.length > 0
        ? unitPrices
            .reduce((s, p) => s.plus(p), new Decimal(0))
            .div(unitPrices.length)
            .toFixed(2)
        : null,
    maxUnitPrice: unitPrices.length > 0 ? Decimal.max(...unitPrices).toFixed(2) : null,
    minUnitPrice: unitPrices.length > 0 ? Decimal.min(...unitPrices).toFixed(2) : null,
  };
}

async function assertParentSkuInStore(parentSkuId: string | null | undefined, storeId: string) {
  if (!parentSkuId) return null;
  const parent = await prisma.sKU.findFirst({
    where: { id: parentSkuId, storeId },
    select: {
      id: true,
      code: true,
      name: true,
      catalogRole: true,
      manufacturerCode: true,
      categoryId: true,
      category: true,
      brand: true,
      variantAxes: true,
      _count: { select: { childSkus: true } },
    },
  });
  if (!parent) {
    throw new Error("商品组不存在或不属于当前店铺");
  }
  const role = deriveCatalogRole({
    catalogRole: parent.catalogRole,
    parentSkuId: null,
    childCount: parent._count.childSkus,
  });
  if (role !== "GROUP") {
    throw new Error("规格 SKU 必须挂到商品组下，不能挂到独立 SKU 或其他规格 SKU");
  }

  return parent;
}

const SUPPORTED_SKU_CURRENCIES = new Set(["CNY", "JPY", "USD", "EUR"]);

function normalizeIdentitySource(value: unknown, hasManualValue: boolean): SkuIdentitySource {
  if (hasManualValue) return "MANUAL";
  return value === "MANUAL" ? "MANUAL" : "AUTO";
}

function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeStringArray(value: string[] | undefined) {
  const items = (value ?? []).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function normalizeStringRecord(value: Record<string, string> | undefined) {
  const entries = Object.entries(value ?? {})
    .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
    .filter(([key, val]) => key && val);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function stringRecordFromJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
    .filter(([key, val]) => key && val);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

async function nextStoreSkuSequence(storeId: string) {
  return (await prisma.sKU.count({ where: { storeId } })) + 1;
}

async function ensureUniqueSkuCode(
  storeId: string,
  candidate: string,
  options: { ignoreId?: string; allowSuffix?: boolean } = {}
) {
  const base = candidate.trim();
  if (!base) throw new Error("SKU编码不能为空");

  let attempt = base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.sKU.findUnique({
      where: { storeId_code: { storeId, code: attempt } },
      select: { id: true },
    });
    if (!existing || existing.id === options.ignoreId) return attempt;
    if (!options.allowSuffix) throw new Error("SKU代码已存在，请换一个编码");
    attempt = `${base}-${String(suffix).padStart(2, "0")}`;
    suffix += 1;
  }
}

async function resolveSkuCreateIdentity(
  data: CreateSKUInput,
  storeId: string,
  organizationId: string
) {
  const explicitRole = normalizeCatalogRole(data.catalogRole);
  const role = explicitRole ?? (data.parentSkuId ? "VARIANT" : "SIMPLE");

  if (role === "GROUP" && data.parentSkuId) {
    throw new Error("商品组不能挂到其他商品组下");
  }
  if (role === "SIMPLE" && data.parentSkuId) {
    throw new Error("独立 SKU 不能选择商品组；如需规格请创建规格 SKU");
  }
  if (role === "VARIANT" && !data.parentSkuId) {
    throw new Error("规格 SKU 必须选择商品组");
  }

  const parent =
    role === "VARIANT" ? await assertParentSkuInStore(data.parentSkuId, storeId) : null;
  const parentAxes = stringArrayFromJson(parent?.variantAxes);
  const variantValues =
    role === "VARIANT"
      ? (normalizeStringRecord(data.variantValues) ??
        (parentAxes.length === 1 && data.variantLabel?.trim()
          ? { [parentAxes[0]]: data.variantLabel.trim() }
          : null))
      : null;
  const variantLabel =
    role === "VARIANT"
      ? normalizeVariantLabel({ variantLabel: data.variantLabel, variantValues })
      : "";

  if (role === "VARIANT" && !variantLabel) {
    throw new Error("规格 SKU 需要填写规格名称，例如 42码、小南、10cm");
  }

  const brand = data.brand?.trim() || parent?.brand || undefined;
  const categoryRecord = await resolveProductCategory({
    organizationId,
    categoryId: data.categoryId ?? parent?.categoryId,
    legacyName: data.category?.trim() || parent?.category,
  });
  const category = categoryRecord?.name;
  const manufacturerCode = normalizeManufacturerCode(
    data.manufacturerCode ?? parent?.manufacturerCode
  );
  const variantAxes = role === "GROUP" ? normalizeStringArray(data.variantAxes) : null;
  const manualName = data.name?.trim();
  const name =
    manualName ||
    buildSkuDisplayName({
      role,
      name: data.name,
      parentName: parent?.name,
      variantLabel,
    });

  if (!name) {
    throw new Error(role === "GROUP" ? "请填写商品组名称" : "请填写商品名称");
  }

  const sequence =
    role === "VARIANT" && parent
      ? parent._count.childSkus + 1
      : await nextStoreSkuSequence(storeId);
  const manualCode = data.code?.trim();
  const codeCandidate =
    manualCode ||
    generateSkuCodeCandidate({
      role,
      name,
      brand,
      manufacturerCode,
      parentCode: parent?.code,
      variantLabel,
      sequence,
    });
  const code = await ensureUniqueSkuCode(storeId, codeCandidate, {
    allowSuffix: !manualCode,
  });

  return {
    role,
    code,
    name,
    parentSkuId: role === "VARIANT" ? parent!.id : null,
    brand,
    categoryId: categoryRecord?.id ?? null,
    category,
    manufacturerCode: manufacturerCode || null,
    variantLabel: variantLabel || null,
    variantAxes,
    variantValues,
    nameSource: normalizeIdentitySource(data.nameSource, Boolean(manualName)),
    codeSource: normalizeIdentitySource(data.codeSource, Boolean(manualCode)),
  };
}

function validateSkuCatalogMeta(attributes: Record<string, unknown>) {
  const meta = parseSkuCatalogMeta(attributes);
  for (const [label, value] of [
    ["参考售价", meta.referencePrice],
    ["参考成本", meta.referenceCost],
  ] as const) {
    if (!value) continue;
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      throw new Error(`${label}必须是有效数字`);
    }
    if (!decimal.isFinite() || decimal.lt(0)) {
      throw new Error(`${label}不能为负数`);
    }
  }

  if (meta.currency && !SUPPORTED_SKU_CURRENCIES.has(meta.currency)) {
    throw new Error("币种必须是 CNY、JPY、USD 或 EUR");
  }
}

export async function getSKUById(id: string) {
  const sku = await prisma.sKU.findUnique({
    where: { id },
    include: {
      parentSku: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      childSkus: {
        select: {
          id: true,
          code: true,
          name: true,
        },
        orderBy: { code: "asc" },
      },
      listings: {
        include: {
          platform: true,
        },
        orderBy: { listedAt: "desc" },
      },
      orderLines: {
        include: {
          order: {
            include: {
              platform: true,
            },
          },
          allocations: {
            select: {
              costAmount: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      purchaseLines: {
        include: {
          purchaseOrder: true,
        },
        orderBy: { createdAt: "desc" },
      },
      inventoryLots: {
        include: {
          location: true,
        },
      },
      itemUnits: {
        include: {
          location: true,
        },
      },
    },
  });

  if (!sku) return null;
  await requireUserContext({ storeId: sku.storeId });

  const lotIds = sku.inventoryLots.map((lot) => lot.id);
  const lotLedgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: {
            entityType: "LOT",
            entityId: { in: lotIds },
          },
        })
      : [];

  const lotQuantityById = lotLedgers.reduce<Record<string, Decimal>>((acc, ledger) => {
    acc[ledger.entityId] = (acc[ledger.entityId] ?? new Decimal(0)).plus(
      new Decimal(ledger.deltaQty.toString())
    );
    return acc;
  }, {});

  const inventoryLots = sku.inventoryLots.map((lot) => ({
    ...lot,
    availableQuantity: (lotQuantityById[lot.id] ?? new Decimal(0)).toString(),
  }));
  const availableLotQuantity = inventoryLots.reduce(
    (sum, lot) => sum.plus(new Decimal(lot.availableQuantity)),
    new Decimal(0)
  );
  const availableItemUnits = sku.itemUnits.filter((item) => item.status === "AVAILABLE").length;
  const activeListings = sku.listings.filter((listing) => listing.status === "ACTIVE").length;

  // --- Performance metrics ---
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const confirmedLines = sku.orderLines.filter((line) =>
    VALID_SALES_STATUSES.includes(line.order.orderStatus)
  );
  const lines30d = confirmedLines.filter((line) => line.order.orderDate >= thirtyDaysAgo);
  const lines90d = confirmedLines.filter((line) => line.order.orderDate >= ninetyDaysAgo);

  const metrics30d = computeSalesMetrics(lines30d);
  const metrics90d = computeSalesMetrics(lines90d);
  const metricsAllTime = computeSalesMetrics(confirmedLines);

  const latestConfirmedLine = confirmedLines[0];
  const latestUnitPrice =
    latestConfirmedLine && new Decimal(latestConfirmedLine.quantity.toString()).gt(0)
      ? new Decimal(latestConfirmedLine.lineAmount.toString())
          .div(new Decimal(latestConfirmedLine.quantity.toString()))
          .toFixed(2)
      : null;
  const latestSoldAt = latestConfirmedLine?.order.orderDate ?? null;
  const salesCurrency = latestConfirmedLine?.order.currency ?? null;

  const activeListingPrices = sku.listings
    .filter((l) => l.status === "ACTIVE" && l.listedPrice)
    .map((l) => new Decimal(l.listedPrice!.toString()));
  const listingPriceRange =
    activeListingPrices.length > 0
      ? {
          min: Decimal.min(...activeListingPrices).toFixed(2),
          max: Decimal.max(...activeListingPrices).toFixed(2),
          currency: sku.listings.find((l) => l.status === "ACTIVE")?.currency ?? null,
        }
      : null;

  return {
    ...sku,
    inventoryLots,
    businessSummary: {
      availableLotQuantity: availableLotQuantity.toString(),
      availableItemUnits,
      activeListings,
      purchaseLineCount: sku.purchaseLines.length,
      salesLineCount: sku.orderLines.length,
      hasAvailableStock: availableLotQuantity.gt(0) || availableItemUnits > 0,
    },
    performanceMetrics: {
      last30d: metrics30d,
      last90d: metrics90d,
      allTime: metricsAllTime,
      latestUnitPrice,
      latestSoldAt: latestSoldAt?.toISOString() ?? null,
      salesCurrency,
      listingPriceRange,
    },
  };
}

export async function setSkuCatalogStatus(id: string, status: CatalogStatus) {
  const existing = await prisma.sKU.findUnique({
    where: { id },
    select: { attributes: true, storeId: true },
  });
  if (!existing) throw new Error("SKU不存在");
  await requireUserContext({ storeId: existing.storeId });

  await prisma.sKU.update({
    where: { id },
    data: {
      attributes: mergeSkuCatalogAttributes(existing.attributes, {
        catalogStatus: status,
      }) as never,
    },
  });

  revalidatePath("/inventory/skus");
  revalidatePath(`/inventory/skus/${id}`);
  revalidatePath("/inventory/sellable");
}

export async function setSkuCatalogStatusAction(id: string, status: CatalogStatus) {
  try {
    await setSkuCatalogStatus(id, status);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "更新SKU状态失败，请重试");
  }
}

export async function createSKU(data: CreateSKUInput) {
  const context = await requireUserContext({ storeId: data.storeId });
  const identity = await resolveSkuCreateIdentity(
    data,
    context.activeStoreId,
    context.organizationId
  );
  const attributes = {
    ...(data.attributes ?? {}),
    ...(identity.variantValues ?? {}),
  };
  validateSkuCatalogMeta(attributes);
  const meta = parseSkuCatalogMeta(attributes, data.imageUrl);
  const imageUrl = resolveCoverImageUrl(meta, data.imageUrl) ?? data.imageUrl ?? null;

  const sku = await prisma.sKU.create({
    data: {
      storeId: context.activeStoreId,
      code: identity.code,
      name: identity.name,
      parentSkuId: identity.parentSkuId,
      catalogRole: identity.role,
      manufacturerCode: identity.manufacturerCode,
      variantLabel: identity.variantLabel,
      variantAxes: identity.variantAxes as never,
      variantValues: identity.variantValues as never,
      nameSource: identity.nameSource,
      codeSource: identity.codeSource,
      categoryId: identity.categoryId,
      category: identity.category,
      brand: identity.brand,
      attributes: attributes as never,
      description: data.description,
      imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  revalidatePath("/inventory/sellable");
  return sku;
}

export async function createSKUAction(data: CreateSKUInput) {
  try {
    const sku = await createSKU(data);
    return actionSuccess(sku);
  } catch (error) {
    return toActionFailure(error, "创建SKU失败，请重试");
  }
}

export async function updateSKU(data: UpdateSKUInput) {
  const existing = await prisma.sKU.findUnique({
    where: { id: data.id },
    select: {
      id: true,
      storeId: true,
      code: true,
      name: true,
      parentSkuId: true,
      catalogRole: true,
      manufacturerCode: true,
      variantLabel: true,
      variantAxes: true,
      variantValues: true,
      nameSource: true,
      codeSource: true,
      categoryId: true,
      category: true,
      brand: true,
      _count: {
        select: {
          childSkus: true,
          inventoryLots: true,
          itemUnits: true,
          listings: true,
          orderLines: true,
          purchaseLines: true,
        },
      },
    },
  });
  if (!existing) throw new Error("SKU不存在");
  const context = await requireUserContext({ storeId: existing.storeId });

  const existingRole = deriveCatalogRole({
    catalogRole: existing.catalogRole,
    parentSkuId: existing.parentSkuId,
    childCount: existing._count.childSkus,
  });
  const role = normalizeCatalogRole(data.catalogRole) ?? existingRole;
  if (existing._count.childSkus > 0 && role !== "GROUP") {
    throw new Error("该商品组下仍有规格 SKU，请先删除或迁移规格 SKU 后再变更类型。");
  }

  const relationCount =
    existing._count.inventoryLots +
    existing._count.itemUnits +
    existing._count.listings +
    existing._count.orderLines +
    existing._count.purchaseLines;
  if (relationCount > 0 && role === "GROUP") {
    throw new Error("已有库存、采购、销售或刊登记录的 SKU 不能改为商品组。");
  }

  const requestedParentSkuId =
    data.parentSkuId === data.id
      ? null
      : data.parentSkuId !== undefined
        ? data.parentSkuId || null
        : existing.parentSkuId;
  if (role === "GROUP" && requestedParentSkuId) {
    throw new Error("商品组不能挂到其他商品组下");
  }
  if (role === "SIMPLE" && requestedParentSkuId) {
    throw new Error("独立 SKU 不能选择商品组；如需规格请创建规格 SKU");
  }
  if (role === "VARIANT" && !requestedParentSkuId) {
    throw new Error("规格 SKU 必须选择商品组");
  }

  const parent =
    role === "VARIANT"
      ? await assertParentSkuInStore(requestedParentSkuId, existing.storeId)
      : null;
  const parentAxes = stringArrayFromJson(parent?.variantAxes);
  const existingVariantValues = stringRecordFromJson(existing.variantValues);
  const variantValues =
    role === "VARIANT"
      ? (normalizeStringRecord(data.variantValues) ??
        existingVariantValues ??
        (parentAxes.length === 1 && data.variantLabel?.trim()
          ? { [parentAxes[0]]: data.variantLabel.trim() }
          : null))
      : null;
  const variantLabel =
    role === "VARIANT"
      ? normalizeVariantLabel({
          variantLabel: data.variantLabel ?? existing.variantLabel,
          variantValues,
        })
      : "";
  if (role === "VARIANT" && !variantLabel) {
    throw new Error("规格 SKU 需要填写规格名称，例如 42码、小南、10cm");
  }

  const manualName = data.name?.trim();
  const manualCode = data.code?.trim();
  const previousNameSource = normalizeIdentitySourceValue(existing.nameSource);
  const previousCodeSource = normalizeIdentitySourceValue(existing.codeSource);
  const nameSource =
    data.nameSource ?? (manualName && manualName !== existing.name ? "MANUAL" : previousNameSource);
  const codeSource =
    data.codeSource ?? (manualCode && manualCode !== existing.code ? "MANUAL" : previousCodeSource);
  const brand = data.brand?.trim() || parent?.brand || existing.brand || undefined;
  const explicitlyClearedCategory = data.categoryId === null && !data.category?.trim() && !parent;
  const categoryRecord = explicitlyClearedCategory
    ? null
    : await resolveProductCategory({
        organizationId: context.organizationId,
        categoryId:
          data.categoryId !== undefined
            ? data.categoryId
            : (parent?.categoryId ?? existing.categoryId),
        legacyName: data.category?.trim() || parent?.category || existing.category,
      });
  const category = categoryRecord?.name;
  const manufacturerCode = normalizeManufacturerCode(
    data.manufacturerCode ?? existing.manufacturerCode ?? parent?.manufacturerCode
  );
  const variantAxes =
    role === "GROUP"
      ? (normalizeStringArray(data.variantAxes) ?? stringArrayFromJson(existing.variantAxes))
      : null;
  const generatedName = buildSkuDisplayName({
    role,
    name: manualName || existing.name,
    parentName: parent?.name,
    variantLabel,
  });
  const name = nameSource === "MANUAL" && manualName ? manualName : generatedName;
  if (!name) throw new Error(role === "GROUP" ? "请填写商品组名称" : "请填写商品名称");

  const sequence =
    role === "VARIANT" && parent
      ? Math.max(parent._count.childSkus, 1)
      : await nextStoreSkuSequence(existing.storeId);
  const generatedCode = generateSkuCodeCandidate({
    role,
    name,
    brand,
    manufacturerCode,
    parentCode: parent?.code,
    variantLabel,
    sequence,
  });
  const codeCandidate = codeSource === "MANUAL" && manualCode ? manualCode : generatedCode;
  const code = await ensureUniqueSkuCode(existing.storeId, codeCandidate, {
    ignoreId: data.id,
    allowSuffix: codeSource !== "MANUAL",
  });

  const attributes = {
    ...(data.attributes ?? {}),
    ...(variantValues ?? {}),
  };
  validateSkuCatalogMeta(attributes);
  const meta = parseSkuCatalogMeta(attributes, data.imageUrl);
  const imageUrl = resolveCoverImageUrl(meta, data.imageUrl) ?? data.imageUrl ?? null;

  const sku = await prisma.sKU.update({
    where: { id: data.id },
    data: {
      code,
      name,
      parentSkuId: role === "VARIANT" ? parent!.id : null,
      catalogRole: role,
      manufacturerCode: manufacturerCode || null,
      variantLabel: variantLabel || null,
      variantAxes: variantAxes as never,
      variantValues: variantValues as never,
      nameSource,
      codeSource,
      categoryId: categoryRecord?.id ?? null,
      category,
      brand,
      attributes: attributes as never,
      description: data.description,
      imageUrl,
    },
  });

  revalidatePath("/inventory/skus");
  revalidatePath(`/inventory/skus/${data.id}`);
  revalidatePath("/inventory/sellable");
  return sku;
}

export async function updateSKUAction(data: UpdateSKUInput) {
  try {
    const sku = await updateSKU(data);
    return actionSuccess(sku);
  } catch (error) {
    return toActionFailure(error, "更新SKU失败，请重试");
  }
}

function requiredStructureText(value: string, label: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`请填写${label}`);
  return normalized;
}

async function ensureStructureIntelligenceParent(input: {
  tx: Prisma.TransactionClient;
  storeId: string;
  skuId?: string | null;
  title: string;
  brand?: string | null;
  category?: string | null;
  categoryId?: string | null;
  imageUrl?: string | null;
  userId: string;
}) {
  const existing = input.skuId
    ? await input.tx.productIntelligenceItem.findFirst({
        where: { storeId: input.storeId, skuId: input.skuId, parentItemId: null },
      })
    : null;
  if (existing) {
    return input.tx.productIntelligenceItem.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        brand: input.brand || existing.brand,
        category: input.category || existing.category,
        categoryId: input.categoryId || existing.categoryId,
        imageUrl: input.imageUrl || existing.imageUrl,
      },
    });
  }
  return input.tx.productIntelligenceItem.create({
    data: {
      storeId: input.storeId,
      skuId: input.skuId || null,
      title: input.title,
      brand: input.brand || null,
      category: input.category || null,
      categoryId: input.categoryId || null,
      imageUrl: input.imageUrl || null,
      visibility: "ORGANIZATION",
      createdById: input.userId,
    },
  });
}

export async function convertSkuStructureAction(input: SkuStructureConversionInput) {
  try {
    const existing = await prisma.sKU.findUnique({
      where: { id: input.skuId },
      include: {
        childSkus: { orderBy: { createdAt: "asc" } },
        _count: {
          select: {
            inventoryLots: true,
            itemUnits: true,
            listings: true,
            orderLines: true,
            purchaseLines: true,
          },
        },
      },
    });
    if (!existing) throw new Error("商品档案不存在或已被删除");
    const context = await requireUserContext({ storeId: existing.storeId });
    const role = deriveCatalogRole({
      catalogRole: existing.catalogRole,
      parentSkuId: existing.parentSkuId,
      childCount: existing.childSkus.length,
    });

    if (input.mode === "SIMPLE_TO_GROUP") {
      if (role !== "SIMPLE") throw new Error("只有独立 SKU 可以用这个方式转换为商品组");
      const groupName = requiredStructureText(input.groupName, "商品组名称");
      const variantLabel = requiredStructureText(input.variantLabel, "规格名称");
      const axisName = requiredStructureText(input.axisName || "规格", "规格维度");
      const groupCode = await ensureUniqueSkuCode(
        existing.storeId,
        generateSkuCodeCandidate({
          role: "GROUP",
          name: groupName,
          sequence: await nextStoreSkuSequence(existing.storeId),
        }),
        { allowSuffix: true }
      );

      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.sKU.create({
          data: {
            storeId: existing.storeId,
            inventoryPoolId: existing.inventoryPoolId,
            code: groupCode,
            name: groupName,
            catalogRole: "GROUP",
            manufacturerCode: existing.manufacturerCode,
            variantAxes: [axisName],
            nameSource: "MANUAL",
            codeSource: "AUTO",
            categoryId: existing.categoryId,
            category: existing.category,
            brand: existing.brand,
            attributes: existing.attributes as Prisma.InputJsonValue,
            description: existing.description,
            imageUrl: existing.imageUrl,
            isAutoCreated: existing.isAutoCreated,
            mergeStatus: existing.mergeStatus,
          },
        });
        const variantName = buildSkuDisplayName({
          role: "VARIANT",
          parentName: groupName,
          variantLabel,
        });
        const variant = await tx.sKU.update({
          where: { id: existing.id },
          data: {
            parentSkuId: group.id,
            catalogRole: "VARIANT",
            name: variantName,
            nameSource: "AUTO",
            variantLabel,
            variantAxes: Prisma.DbNull,
            variantValues: { [axisName]: variantLabel },
          },
        });

        const linkedItems = await tx.productIntelligenceItem.findMany({
          where: { storeId: existing.storeId, skuId: existing.id },
        });
        const previousParentId = linkedItems.find((item) => item.parentItemId)?.parentItemId;
        const previousParent = previousParentId
          ? await tx.productIntelligenceItem.findUnique({ where: { id: previousParentId } })
          : null;
        const intelligenceParent =
          previousParent && !previousParent.skuId
            ? await tx.productIntelligenceItem.update({
                where: { id: previousParent.id },
                data: {
                  skuId: group.id,
                  title: groupName,
                  brand: existing.brand || previousParent.brand,
                  category: existing.category || previousParent.category,
                  categoryId: existing.categoryId || previousParent.categoryId,
                  imageUrl: existing.imageUrl || previousParent.imageUrl,
                },
              })
            : await ensureStructureIntelligenceParent({
                tx,
                storeId: existing.storeId,
                skuId: group.id,
                title: groupName,
                brand: existing.brand,
                category: existing.category,
                categoryId: existing.categoryId,
                imageUrl: existing.imageUrl,
                userId: context.userId,
              });
        if (linkedItems.length) {
          await tx.productIntelligenceItem.updateMany({
            where: { id: { in: linkedItems.map((item) => item.id) } },
            data: { parentItemId: intelligenceParent.id, title: variantLabel },
          });
        }
        return { group, targetSku: variant };
      });

      revalidatePath("/inventory/skus");
      revalidatePath(`/inventory/skus/${existing.id}`);
      revalidatePath(`/inventory/skus/${result.group.id}`);
      revalidatePath("/inventory/sellable");
      revalidatePath("/product-intelligence");
      return actionSuccess({
        mode: input.mode,
        groupId: result.group.id,
        targetSkuId: result.targetSku.id,
        targetSkuCode: result.targetSku.code,
      });
    }

    if (role !== "GROUP") throw new Error("只有商品组可以折叠为独立 SKU");
    if (existing.childSkus.length > 1) {
      throw new Error("该商品组有多个规格 SKU，请先合并或迁移到只剩一个规格后再转换");
    }
    const directRelationCount =
      existing._count.inventoryLots +
      existing._count.itemUnits +
      existing._count.listings +
      existing._count.orderLines +
      existing._count.purchaseLines;
    if (directRelationCount > 0) {
      throw new Error("商品组本身存在库存、采购、销售或上架记录，需先修复这些异常关联");
    }
    const simpleName = requiredStructureText(input.simpleName, "独立 SKU 名称");

    const result = await prisma.$transaction(async (tx) => {
      const onlyChild = existing.childSkus[0] || null;
      const groupIntelligenceItems = await tx.productIntelligenceItem.findMany({
        where: { storeId: existing.storeId, skuId: existing.id },
        select: { id: true },
      });
      const targetSku = onlyChild
        ? await tx.sKU.update({
            where: { id: onlyChild.id },
            data: {
              parentSkuId: null,
              catalogRole: "SIMPLE",
              name: simpleName,
              nameSource: "MANUAL",
              variantLabel: null,
              variantAxes: Prisma.DbNull,
              variantValues: Prisma.DbNull,
            },
          })
        : await tx.sKU.update({
            where: { id: existing.id },
            data: {
              parentSkuId: null,
              catalogRole: "SIMPLE",
              name: simpleName,
              nameSource: "MANUAL",
              variantLabel: null,
              variantAxes: Prisma.DbNull,
              variantValues: Prisma.DbNull,
              mergeStatus: existing.mergeStatus === "MERGED" ? "PENDING" : existing.mergeStatus,
            },
          });

      let intelligenceParent = await tx.productIntelligenceItem.findFirst({
        where: { storeId: existing.storeId, skuId: existing.id, parentItemId: null },
      });
      if (intelligenceParent) {
        intelligenceParent = await tx.productIntelligenceItem.update({
          where: { id: intelligenceParent.id },
          data: { skuId: null, title: simpleName },
        });
      } else {
        intelligenceParent = await ensureStructureIntelligenceParent({
          tx,
          storeId: existing.storeId,
          title: simpleName,
          brand: targetSku.brand,
          category: targetSku.category,
          categoryId: targetSku.categoryId,
          imageUrl: targetSku.imageUrl,
          userId: context.userId,
        });
      }
      let intelligenceChild = await tx.productIntelligenceItem.findFirst({
        where: { storeId: existing.storeId, skuId: targetSku.id, parentItemId: { not: null } },
      });
      if (intelligenceChild) {
        intelligenceChild = await tx.productIntelligenceItem.update({
          where: { id: intelligenceChild.id },
          data: { parentItemId: intelligenceParent.id, title: "标准款" },
        });
        await tx.productIntelligenceItem.updateMany({
          where: {
            storeId: existing.storeId,
            skuId: targetSku.id,
            id: { not: intelligenceChild.id },
          },
          data: { parentItemId: intelligenceParent.id, title: "标准款" },
        });
      } else {
        intelligenceChild = await tx.productIntelligenceItem.create({
          data: {
            storeId: existing.storeId,
            parentItemId: intelligenceParent.id,
            skuId: targetSku.id,
            title: "标准款",
            brand: targetSku.brand,
            category: targetSku.category,
            categoryId: targetSku.categoryId,
            imageUrl: targetSku.imageUrl,
            visibility: "ORGANIZATION",
            createdById: context.userId,
          },
        });
      }
      if (groupIntelligenceItems.length) {
        await tx.productIntelligenceObservation.updateMany({
          where: { itemId: { in: groupIntelligenceItems.map((item) => item.id) } },
          data: { itemId: intelligenceChild.id },
        });
        await tx.productIntelligenceItem.updateMany({
          where: { id: { in: groupIntelligenceItems.map((item) => item.id) } },
          data: { skuId: null },
        });
      }

      if (onlyChild) {
        const archivedAttributes = mergeSkuCatalogAttributes(existing.attributes, {
          catalogStatus: "disabled",
          notes: `已折叠为独立 SKU ${targetSku.code}`,
        });
        await tx.sKU.update({
          where: { id: existing.id },
          data: { mergeStatus: "MERGED", attributes: archivedAttributes as Prisma.InputJsonValue },
        });
        const groupLinks = await tx.captureBusinessLink.findMany({
          where: { refType: "SKU", refId: existing.id },
          select: { captureId: true },
        });
        if (groupLinks.length) {
          await tx.captureBusinessLink.createMany({
            data: groupLinks.map((link) => ({
              captureId: link.captureId,
              refType: "SKU",
              refId: targetSku.id,
            })),
            skipDuplicates: true,
          });
          await tx.captureBusinessLink.deleteMany({
            where: { refType: "SKU", refId: existing.id },
          });
        }
      }
      return { targetSku, archivedGroupId: onlyChild ? existing.id : null };
    });

    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${existing.id}`);
    revalidatePath(`/inventory/skus/${result.targetSku.id}`);
    revalidatePath("/inventory/sellable");
    revalidatePath("/product-intelligence");
    return actionSuccess({
      mode: input.mode,
      targetSkuId: result.targetSku.id,
      targetSkuCode: result.targetSku.code,
      archivedGroupId: result.archivedGroupId,
    });
  } catch (error) {
    return toActionFailure(error, "调整商品结构失败，请重试");
  }
}

export async function updateSkuQuickInfoAction(data: UpdateSkuQuickInfoInput) {
  try {
    const existing = await prisma.sKU.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        storeId: true,
        name: true,
        catalogRole: true,
        categoryId: true,
        category: true,
        childSkus: {
          select: {
            id: true,
            nameSource: true,
            variantLabel: true,
            categoryId: true,
            category: true,
            brand: true,
          },
        },
      },
    });
    if (!existing) throw new Error("商品档案不存在");
    const context = await requireUserContext({ storeId: existing.storeId });

    const name = data.name.trim();
    if (!name) throw new Error("请填写商品名称");
    const categoryRecord =
      data.categoryId === null && !data.category?.trim()
        ? null
        : await resolveProductCategory({
            organizationId: context.organizationId,
            categoryId: data.categoryId ?? existing.categoryId,
            legacyName: data.category ?? existing.category,
          });
    const category = categoryRecord?.name ?? null;
    const brand = data.brand?.trim() || null;

    await prisma.$transaction([
      prisma.sKU.update({
        where: { id: existing.id },
        data: {
          name,
          nameSource: name === existing.name ? undefined : "MANUAL",
          categoryId: categoryRecord?.id ?? null,
          category,
          brand,
        },
      }),
      ...existing.childSkus.map((child) =>
        prisma.sKU.update({
          where: { id: child.id },
          data: {
            name:
              name !== existing.name && child.nameSource !== "MANUAL" && child.variantLabel
                ? buildSkuDisplayName({
                    role: "VARIANT",
                    parentName: name,
                    variantLabel: child.variantLabel,
                  })
                : undefined,
            category:
              data.syncMissingVariantInfo && !child.category && category ? category : undefined,
            categoryId:
              data.syncMissingVariantInfo && !child.categoryId && categoryRecord
                ? categoryRecord.id
                : undefined,
            brand: data.syncMissingVariantInfo && !child.brand && brand ? brand : undefined,
          },
        })
      ),
    ]);

    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${existing.id}`);
    revalidatePath("/inventory/sellable");
    return actionSuccess({ id: existing.id });
  } catch (error) {
    return toActionFailure(error, "保存商品信息失败，请重试");
  }
}

export interface SKUDeletionImpact {
  canDelete: boolean;
  hasBusinessHistory: boolean;
  references: Array<{
    key: "variants" | "lots" | "items" | "listings" | "sales" | "purchases";
    label: string;
    count: number;
    href: string;
  }>;
}

async function getSKUDeletionRecord(id: string) {
  return prisma.sKU.findUnique({
    where: { id },
    select: {
      storeId: true,
      code: true,
      _count: {
        select: {
          childSkus: true,
          inventoryLots: true,
          itemUnits: true,
          listings: true,
          orderLines: true,
          purchaseLines: true,
        },
      },
    },
  });
}

function buildSKUDeletionImpact(
  id: string,
  code: string,
  counts: NonNullable<Awaited<ReturnType<typeof getSKUDeletionRecord>>>["_count"]
): SKUDeletionImpact {
  const query = encodeURIComponent(code);
  const allReferences: SKUDeletionImpact["references"] = [
    {
      key: "variants",
      label: "规格 SKU",
      count: counts.childSkus,
      href: `/inventory/skus/${id}`,
    },
    {
      key: "lots",
      label: "库存批次",
      count: counts.inventoryLots,
      href: `/inventory/lots?query=${query}`,
    },
    {
      key: "items",
      label: "单品库存",
      count: counts.itemUnits,
      href: `/inventory/items?query=${query}`,
    },
    {
      key: "listings",
      label: "刊登记录",
      count: counts.listings,
      href: `/listing?query=${query}`,
    },
    {
      key: "sales",
      label: "销售记录",
      count: counts.orderLines,
      href: `/sales?query=${query}`,
    },
    {
      key: "purchases",
      label: "采购记录",
      count: counts.purchaseLines,
      href: `/procurement?query=${query}`,
    },
  ];
  const references = allReferences.filter((reference) => reference.count > 0);

  return {
    canDelete: references.length === 0,
    hasBusinessHistory: counts.orderLines > 0 || counts.purchaseLines > 0,
    references,
  };
}

export async function getSKUDeletionImpactAction(id: string) {
  try {
    const related = await getSKUDeletionRecord(id);
    if (!related) throw new Error("SKU不存在或已被删除");
    await requireUserContext({ storeId: related.storeId });
    return actionSuccess({
      impact: buildSKUDeletionImpact(id, related.code, related._count),
    });
  } catch (error) {
    return toActionFailure(error, "无法检查SKU关联数据，请重试");
  }
}

export async function deleteSKU(id: string) {
  const related = await getSKUDeletionRecord(id);

  if (!related) {
    throw new Error("SKU不存在或已被删除");
  }
  await requireUserContext({ storeId: related.storeId });

  if (related._count.childSkus > 0) {
    throw new Error("该商品组下仍有规格 SKU，请先删除或迁移规格 SKU 后再删除商品组。");
  }

  const impact = buildSKUDeletionImpact(id, related.code, related._count);

  if (!impact.canDelete) {
    if (impact.hasBusinessHistory) {
      throw new Error("该SKU已有采购或销售历史，不能删除。请停用SKU以保留订单、成本与利润追溯。");
    }
    throw new Error("该SKU仍有关联库存或刊登记录，请先处理关联数据；无需继续使用时可停用SKU。");
  }

  await prisma.sKU.delete({
    where: { id },
  });

  revalidatePath("/inventory/skus");
}

export async function deleteSKUAction(id: string) {
  try {
    await deleteSKU(id);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除SKU失败，请重试");
  }
}

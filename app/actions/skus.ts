"use server";

import { prisma } from "@/lib/prisma";
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
  category?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  description?: string;
  imageUrl?: string;
}

export interface UpdateSKUInput extends CreateSKUInput {
  id: string;
}

export async function getSKUParentOptions(storeId: string, excludeId?: string) {
  const context = await requireUserContext({ storeId });
  return await prisma.sKU.findMany({
    where: {
      storeId: context.activeStoreId,
      id: excludeId ? { not: excludeId } : undefined,
      OR: [
        { catalogRole: "GROUP" },
        { parentSkuId: null, childSkus: { some: {} } },
      ],
    },
    select: {
      id: true,
      code: true,
      name: true,
      catalogRole: true,
      manufacturerCode: true,
      variantAxes: true,
      category: true,
      brand: true,
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
  const profitRate = totalRevenue.gt(0)
    ? grossProfit.div(totalRevenue).mul(100)
    : new Decimal(0);
  const avgUnitProfit = totalQuantity.gt(0)
    ? grossProfit.div(totalQuantity)
    : new Decimal(0);

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
    maxUnitPrice:
      unitPrices.length > 0 ? Decimal.max(...unitPrices).toFixed(2) : null,
    minUnitPrice:
      unitPrices.length > 0 ? Decimal.min(...unitPrices).toFixed(2) : null,
  };
}

async function assertParentSkuInStore(
  parentSkuId: string | null | undefined,
  storeId: string
) {
  if (!parentSkuId) return null;
  const parent = await prisma.sKU.findFirst({
    where: { id: parentSkuId, storeId },
    select: {
      id: true,
      code: true,
      name: true,
      catalogRole: true,
      manufacturerCode: true,
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
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
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

async function resolveSkuCreateIdentity(data: CreateSKUInput, storeId: string) {
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

  const parent = role === "VARIANT"
    ? await assertParentSkuInStore(data.parentSkuId, storeId)
    : null;
  const parentAxes = stringArrayFromJson(parent?.variantAxes);
  const variantValues =
    role === "VARIANT"
      ? normalizeStringRecord(data.variantValues) ??
        (parentAxes.length === 1 && data.variantLabel?.trim()
          ? { [parentAxes[0]]: data.variantLabel.trim() }
          : null)
      : null;
  const variantLabel =
    role === "VARIANT"
      ? normalizeVariantLabel({ variantLabel: data.variantLabel, variantValues })
      : "";

  if (role === "VARIANT" && !variantLabel) {
    throw new Error("规格 SKU 需要填写规格名称，例如 42码、小南、10cm");
  }

  const brand = data.brand?.trim() || parent?.brand || undefined;
  const category = data.category?.trim() || parent?.category || undefined;
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
  const lines30d = confirmedLines.filter(
    (line) => line.order.orderDate >= thirtyDaysAgo
  );
  const lines90d = confirmedLines.filter(
    (line) => line.order.orderDate >= ninetyDaysAgo
  );

  const metrics30d = computeSalesMetrics(lines30d);
  const metrics90d = computeSalesMetrics(lines90d);
  const metricsAllTime = computeSalesMetrics(confirmedLines);

  const latestConfirmedLine = confirmedLines[0];
  const latestUnitPrice =
    latestConfirmedLine &&
    new Decimal(latestConfirmedLine.quantity.toString()).gt(0)
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
          currency:
            sku.listings.find((l) => l.status === "ACTIVE")?.currency ?? null,
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
  const identity = await resolveSkuCreateIdentity(data, context.activeStoreId);
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
  await requireUserContext({ storeId: existing.storeId });

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

  const parent = role === "VARIANT"
    ? await assertParentSkuInStore(requestedParentSkuId, existing.storeId)
    : null;
  const parentAxes = stringArrayFromJson(parent?.variantAxes);
  const existingVariantValues = stringRecordFromJson(existing.variantValues);
  const variantValues =
    role === "VARIANT"
      ? normalizeStringRecord(data.variantValues) ??
        existingVariantValues ??
        (parentAxes.length === 1 && data.variantLabel?.trim()
          ? { [parentAxes[0]]: data.variantLabel.trim() }
          : null)
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
    data.nameSource ??
    (manualName && manualName !== existing.name ? "MANUAL" : previousNameSource);
  const codeSource =
    data.codeSource ??
    (manualCode && manualCode !== existing.code ? "MANUAL" : previousCodeSource);
  const brand = data.brand?.trim() || parent?.brand || existing.brand || undefined;
  const category =
    data.category?.trim() || parent?.category || existing.category || undefined;
  const manufacturerCode = normalizeManufacturerCode(
    data.manufacturerCode ?? existing.manufacturerCode ?? parent?.manufacturerCode
  );
  const variantAxes =
    role === "GROUP"
      ? normalizeStringArray(data.variantAxes) ?? stringArrayFromJson(existing.variantAxes)
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

export async function deleteSKU(id: string) {
  const related = await prisma.sKU.findUnique({
    where: { id },
    select: {
      storeId: true,
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

  if (!related) {
    throw new Error("SKU不存在或已被删除");
  }
  await requireUserContext({ storeId: related.storeId });

  if (related._count.childSkus > 0) {
    throw new Error("该商品组下仍有规格 SKU，请先删除或迁移规格 SKU 后再删除商品组。");
  }

  const relationCount =
    related._count.inventoryLots +
    related._count.itemUnits +
    related._count.listings +
    related._count.orderLines +
    related._count.purchaseLines;

  if (relationCount > 0) {
    throw new Error("该SKU已有库存、采购、销售或刊登记录，不能直接删除。请先处理关联业务数据。");
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

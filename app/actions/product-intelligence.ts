"use server";

import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

const VISIBILITY_VALUES = new Set(["PUBLIC", "ORGANIZATION", "PRIVATE"]);
const STATUS_VALUES = new Set(["ACTIVE", "HIDDEN", "ARCHIVED"]);
const PRODUCT_KIND_VALUES = new Set(["NEW", "USED", "MIXED"]);
const SOURCE_TYPE_VALUES = new Set([
  "MANUAL",
  "REAL_PURCHASE",
  "REAL_SALE",
  "MARKET_SEEN",
  "PLATFORM_LISTING",
  "SUPPLY_OFFER",
]);
const PRICE_TYPE_VALUES = new Set(["PURCHASE", "SALE", "WHOLESALE", "RESALE", "OFFER"]);
const CONFIDENCE_VALUES = new Set(["LOW", "MEDIUM", "HIGH"]);
const SUPPORTED_CURRENCIES = new Set(["CNY", "JPY", "USD", "EUR"]);

export interface ProductIntelligenceFilters {
  storeId?: string;
  q?: string;
  category?: string;
  visibility?: string;
  currency?: string;
  condition?: string;
  hasPrice?: string;
}

export interface ProductIntelligenceItemInput {
  storeId?: string;
  parentItemId?: string | null;
  title: string;
  brand?: string;
  category?: string;
  model?: string;
  productKind?: string;
  description?: string;
  imageUrl?: string;
  tags?: string;
  visibility?: string;
  status?: string;
}

export interface ProductIntelligenceObservationInput {
  storeId?: string;
  itemId: string;
  sourceType?: string;
  priceType?: string;
  amount: string;
  currency: string;
  quantity?: string;
  sourceName?: string;
  platformName?: string;
  conditionGrade?: string;
  confidence?: string;
  visibility?: string;
  observedAt?: Date;
  note?: string;
}

export interface CreateProductIntelligenceInput extends ProductIntelligenceItemInput {
  initialObservation?: Omit<ProductIntelligenceObservationInput, "itemId" | "storeId">;
  initialObservations?: Array<Omit<ProductIntelligenceObservationInput, "itemId" | "storeId">>;
}

export interface CreateProductIntelligenceVariantInput {
  storeId?: string;
  parentItemId: string;
  title: string;
  model?: string;
  imageUrl?: string;
  tags?: string;
  visibility?: string;
}

function normalizeEnum(value: string | undefined, allowed: Set<string>, fallback: string) {
  const normalized = value?.trim().toUpperCase() || fallback;
  if (!allowed.has(normalized)) {
    throw new Error(`不支持的选项：${value}`);
  }
  return normalized;
}

function optionalText(value: string | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function parseTags(value: string | undefined) {
  const tags = (value ?? "")
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length > 0 ? tags : null;
}

function parseAmount(value: string, label: string) {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`${label}必须是有效数字`);
  }
  if (!decimal.isFinite() || decimal.lt(0)) {
    throw new Error(`${label}不能为负数`);
  }
  return decimal;
}

function serializeObservation<
  T extends {
    amount: { toString(): string };
    quantity: { toString(): string } | null;
    priceType: string;
    currency: string;
    observedAt: Date;
    createdAt: Date;
    updatedAt: Date;
    store?: { id: string; name: string; code: string } | null;
  },
>(observation: T) {
  return {
    ...observation,
    amount: observation.amount.toString(),
    quantity: observation.quantity?.toString() ?? null,
    observedAt: observation.observedAt.toISOString(),
    createdAt: observation.createdAt.toISOString(),
    updatedAt: observation.updatedAt.toISOString(),
  };
}

function serializeItem<
  T extends {
    id: string;
    parentItemId: string | null;
    createdAt: Date;
    updatedAt: Date;
    tags: unknown;
    store: { id: string; name: string; code: string };
    observations?: Array<Parameters<typeof serializeObservation>[0]>;
    parentItem?: { id: string; title: string; brand: string | null; category: string | null } | null;
    childItems?: Array<{
      id: string;
      title: string;
      brand: string | null;
      category: string | null;
      model: string | null;
      imageUrl: string | null;
      visibility: string;
      status: string;
      updatedAt: Date;
      observations: Array<Parameters<typeof serializeObservation>[0]>;
    }>;
  },
>(item: T) {
  return {
    ...item,
    tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [],
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    observations: item.observations?.map(serializeObservation) ?? [],
    childItems: item.childItems?.map((child) => ({
      ...child,
      updatedAt: child.updatedAt.toISOString(),
      observations: child.observations.map(serializeObservation),
      summary: summarizeObservations(child.observations),
    })) ?? [],
  };
}

function itemVisibilityWhere(storeId: string) {
  return {
    OR: [
      { visibility: "PUBLIC", status: "ACTIVE" },
      { storeId, status: { not: "ARCHIVED" } },
    ],
  };
}

function observationVisibilityWhere(storeId: string) {
  return {
    OR: [
      { visibility: "PUBLIC" },
      { storeId },
    ],
  };
}

function revalidateProductIntelligence(id?: string) {
  revalidatePath("/product-intelligence");
  if (id) revalidatePath(`/product-intelligence/${id}`);
}

function summarizeObservations(
  observations: Array<{ amount: { toString(): string }; priceType: string; currency: string; observedAt: Date }>
) {
  const buildRanges = (priceTypes: string[]) => {
    const pricesByCurrency = new Map<string, Decimal[]>();
    for (const row of observations) {
      if (!priceTypes.includes(row.priceType)) continue;
      const currency = row.currency || "UNKNOWN";
      const prices = pricesByCurrency.get(currency) ?? [];
      prices.push(new Decimal(row.amount.toString()));
      pricesByCurrency.set(currency, prices);
    }
    return Array.from(pricesByCurrency.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, prices]) => ({
        currency,
        min: Decimal.min(...prices).toFixed(2),
        max: Decimal.max(...prices).toFixed(2),
      }));
  };
  const saleRanges = buildRanges(["SALE", "RESALE", "OFFER"]);
  const purchaseRanges = buildRanges(["PURCHASE", "WHOLESALE"]);
  const salePrices = saleRanges.map((range) => new Decimal(range.min));
  const purchasePrices = purchaseRanges.map((range) => new Decimal(range.min));
  const currency = observations[0]?.currency ?? null;
  return {
    observationCount: observations.length,
    latestObservedAt: observations[0]?.observedAt.toISOString() ?? null,
    currency,
    purchaseRanges,
    saleRanges,
    minSalePrice: salePrices.length > 0 ? Decimal.min(...salePrices).toFixed(2) : null,
    maxSalePrice: saleRanges.length > 0 ? Decimal.max(...saleRanges.map((range) => new Decimal(range.max))).toFixed(2) : null,
    minPurchasePrice: purchasePrices.length > 0 ? Decimal.min(...purchasePrices).toFixed(2) : null,
    maxPurchasePrice: purchaseRanges.length > 0 ? Decimal.max(...purchaseRanges.map((range) => new Decimal(range.max))).toFixed(2) : null,
  };
}

function summarizeSaleObservationsByCondition(
  observations: Array<{
    amount: { toString(): string };
    priceType: string;
    currency: string;
    conditionGrade: string | null;
    observedAt: Date;
  }>
) {
  const salePriceTypes = new Set(["SALE", "RESALE", "OFFER"]);
  const byCondition = new Map<string, typeof observations>();
  for (const observation of observations) {
    if (!salePriceTypes.has(observation.priceType)) continue;
    const condition = observation.conditionGrade?.trim() || "未标注";
    const rows = byCondition.get(condition) ?? [];
    rows.push(observation);
    byCondition.set(condition, rows);
  }
  return Array.from(byCondition.entries())
    .map(([condition, rows]) => ({
      condition,
      observationCount: rows.length,
      saleRanges: summarizeObservations(rows).saleRanges,
    }))
    .sort((a, b) => b.observationCount - a.observationCount || a.condition.localeCompare(b.condition, "zh-CN"));
}

async function resolveParentItemId(parentItemId: string | null | undefined, storeId: string) {
  const normalized = parentItemId?.trim();
  if (!normalized) return null;
  const parent = await prisma.productIntelligenceItem.findFirst({
    where: {
      id: normalized,
      parentItemId: null,
      ...itemVisibilityWhere(storeId),
    },
    select: { id: true },
  });
  if (!parent) throw new Error("选择的商品组不存在或不可见");
  return parent.id;
}

function compactVisibleItemSelect(storeId: string, observationTake = 10) {
  return {
    id: true,
    title: true,
    brand: true,
    category: true,
    model: true,
    imageUrl: true,
    visibility: true,
    status: true,
    updatedAt: true,
    observations: {
      where: observationVisibilityWhere(storeId),
      include: {
        store: { select: { id: true, name: true, code: true } },
      },
      orderBy: { observedAt: "desc" as const },
      take: observationTake,
    },
  };
}

export async function getProductIntelligenceItems(filters: ProductIntelligenceFilters = {}) {
  const context = await requireUserContext(filters.storeId ? { storeId: filters.storeId } : undefined);
  const q = filters.q?.trim();
  const category = filters.category?.trim();
  const visibility = filters.visibility?.trim().toUpperCase();
  const currency = filters.currency?.trim().toUpperCase();
  const condition = filters.condition?.trim();
  const hasPrice = filters.hasPrice === "1" || filters.hasPrice?.toLowerCase() === "true";
  const observationFilter =
    (currency && SUPPORTED_CURRENCIES.has(currency)) || condition || hasPrice
      ? {
          OR: [
            {
              observations: {
                some: {
                  ...(currency && SUPPORTED_CURRENCIES.has(currency) ? { currency } : {}),
                  ...(condition ? { conditionGrade: condition } : {}),
                  ...(hasPrice ? { priceType: { in: ["SALE", "RESALE", "OFFER"] } } : {}),
                  ...observationVisibilityWhere(context.activeStoreId),
                },
              },
            },
            {
              childItems: {
                some: {
                  ...itemVisibilityWhere(context.activeStoreId),
                  observations: {
                    some: {
                      ...(currency && SUPPORTED_CURRENCIES.has(currency) ? { currency } : {}),
                      ...(condition ? { conditionGrade: condition } : {}),
                      ...(hasPrice ? { priceType: { in: ["SALE", "RESALE", "OFFER"] } } : {}),
                      ...observationVisibilityWhere(context.activeStoreId),
                    },
                  },
                },
              },
            },
          ],
        }
      : {};

  const items = await prisma.productIntelligenceItem.findMany({
    where: {
      ...itemVisibilityWhere(context.activeStoreId),
      parentItemId: null,
      ...observationFilter,
      ...(visibility && VISIBILITY_VALUES.has(visibility) ? { visibility } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              {
                childItems: {
                  some: {
                    AND: [
                      itemVisibilityWhere(context.activeStoreId),
                      {
                        OR: [
                          { title: { contains: q, mode: "insensitive" } },
                          { model: { contains: q, mode: "insensitive" } },
                        ],
                      },
                    ],
                  },
                },
              },
              {
                childItems: {
                  some: {
                    AND: [
                      itemVisibilityWhere(context.activeStoreId),
                      {
                        observations: {
                          some: {
                            AND: [
                              observationVisibilityWhere(context.activeStoreId),
                              {
                                OR: [
                                  { platformName: { contains: q, mode: "insensitive" } },
                                  { sourceName: { contains: q, mode: "insensitive" } },
                                  { conditionGrade: { contains: q, mode: "insensitive" } },
                                ],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      store: { select: { id: true, name: true, code: true } },
      observations: {
        where: observationVisibilityWhere(context.activeStoreId),
        orderBy: { observedAt: "desc" },
        take: 10,
      },
      childItems: {
        where: itemVisibilityWhere(context.activeStoreId),
        select: compactVisibleItemSelect(context.activeStoreId),
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return items.map((item) => ({
    ...serializeItem(item),
    summary: summarizeObservations(
      item.childItems.length > 0 ? item.childItems.flatMap((child) => child.observations) : item.observations,
    ),
    variantSummaries: item.childItems.map((child) => ({
      id: child.id,
      title: child.title,
      category: child.category,
      summary: summarizeObservations(child.observations),
      conditionSummaries: summarizeSaleObservationsByCondition(child.observations),
    })),
    conditionSummaries: summarizeSaleObservationsByCondition(item.observations),
    variantCount: item.childItems.length,
    isOwner: item.storeId === context.activeStoreId,
  }));
}

export async function getProductIntelligenceConditionOptions(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const rows = await prisma.productIntelligenceObservation.findMany({
    where: {
      conditionGrade: { not: null },
      ...observationVisibilityWhere(context.activeStoreId),
    },
    select: { conditionGrade: true },
    distinct: ["conditionGrade"],
    orderBy: { conditionGrade: "asc" },
  });
  return rows
    .map((row) => row.conditionGrade)
    .filter((condition): condition is string => Boolean(condition));
}

export async function getProductIntelligenceParentOptions(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const items = await prisma.productIntelligenceItem.findMany({
    where: {
      ...itemVisibilityWhere(context.activeStoreId),
      parentItemId: null,
    },
    select: {
      id: true,
      title: true,
      brand: true,
      category: true,
      _count: { select: { childItems: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return items;
}

export async function getProductIntelligenceCategories(storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const rows = await prisma.productIntelligenceItem.findMany({
    where: itemVisibilityWhere(context.activeStoreId),
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.map((row) => row.category).filter((category): category is string => Boolean(category));
}

export async function getProductIntelligenceItemById(id: string, storeId?: string) {
  const context = await requireUserContext(storeId ? { storeId } : undefined);
  const item = await prisma.productIntelligenceItem.findFirst({
    where: {
      id,
      ...itemVisibilityWhere(context.activeStoreId),
    },
    include: {
      store: { select: { id: true, name: true, code: true } },
      observations: {
        where: observationVisibilityWhere(context.activeStoreId),
        include: {
          store: { select: { id: true, name: true, code: true } },
        },
        orderBy: { observedAt: "desc" },
      },
      parentItem: {
        select: { id: true, title: true, brand: true, category: true },
      },
      childItems: {
        where: itemVisibilityWhere(context.activeStoreId),
        select: compactVisibleItemSelect(context.activeStoreId, 300),
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!item) return null;
  return {
    ...serializeItem(item),
    summary: summarizeObservations(item.childItems.flatMap((child) => child.observations)),
    variantCount: item.childItems.length,
    isOwner: item.storeId === context.activeStoreId,
    activeStoreId: context.activeStoreId,
  };
}

export async function createProductIntelligenceAction(data: CreateProductIntelligenceInput) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const title = data.title.trim();
    if (!title) throw new Error("商品名称不能为空");
    if (!data.category?.trim() && !data.parentItemId) throw new Error("请选择或填写品类");
    const observations = data.initialObservations ?? (data.initialObservation ? [data.initialObservation] : []);
    const parentItemId = await resolveParentItemId(data.parentItemId, context.activeStoreId);
    if (!parentItemId && observations.length > 0) {
      throw new Error("商品组只作为父级容器，请在具体 SKU 上记录价格");
    }

    const item = await prisma.productIntelligenceItem.create({
      data: {
        storeId: context.activeStoreId,
        parentItemId,
        title,
        brand: optionalText(data.brand),
        category: optionalText(data.category),
        model: optionalText(data.model),
        productKind: normalizeEnum(data.productKind, PRODUCT_KIND_VALUES, "NEW"),
        description: optionalText(data.description),
        imageUrl: optionalText(data.imageUrl),
        tags: parseTags(data.tags) ?? undefined,
        visibility: normalizeEnum(data.visibility, VISIBILITY_VALUES, "PUBLIC"),
        status: normalizeEnum(data.status, STATUS_VALUES, "ACTIVE"),
        createdById: context.userId,
        updatedById: context.userId,
        observations: observations.length > 0
          ? {
              create: observations.map((observation) => buildObservationCreateData(context, observation)),
            }
          : undefined,
      },
    });

    revalidateProductIntelligence(item.id);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "创建商品情报失败，请重试");
  }
}

export async function createProductIntelligenceVariantAction(
  data: CreateProductIntelligenceVariantInput,
) {
  try {
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const title = data.title.trim();
    if (!title) throw new Error("SKU 名称不能为空");
    const parentItemId = await resolveParentItemId(data.parentItemId, context.activeStoreId);
    if (!parentItemId) throw new Error("请选择商品组");
    const parent = await prisma.productIntelligenceItem.findUnique({
      where: { id: parentItemId },
      select: {
        brand: true,
        category: true,
        productKind: true,
        description: true,
      },
    });
    if (!parent) throw new Error("商品组不存在");

    const variant = await prisma.productIntelligenceItem.create({
      data: {
        storeId: context.activeStoreId,
        parentItemId,
        title,
        brand: parent.brand,
        category: parent.category,
        model: optionalText(data.model),
        productKind: parent.productKind,
        description: parent.description,
        imageUrl: optionalText(data.imageUrl),
        tags: parseTags(data.tags) ?? undefined,
        visibility: normalizeEnum(data.visibility, VISIBILITY_VALUES, "PUBLIC"),
        status: "ACTIVE",
        createdById: context.userId,
        updatedById: context.userId,
      },
    });

    revalidateProductIntelligence(parentItemId);
    revalidateProductIntelligence(variant.id);
    return actionSuccess({ id: variant.id });
  } catch (error) {
    return toActionFailure(error, "创建 SKU 失败，请重试");
  }
}

export async function updateProductIntelligenceAction(id: string, data: ProductIntelligenceItemInput) {
  try {
    const existing = await prisma.productIntelligenceItem.findUnique({ where: { id } });
    if (!existing) throw new Error("商品情报不存在");
    const context = await requireUserContext({ storeId: data.storeId ?? existing.storeId });
    if (existing.storeId !== context.activeStoreId) {
      throw new Error("只有贡献店铺可以编辑这条商品情报");
    }
    const title = data.title.trim();
    if (!title) throw new Error("商品名称不能为空");
    const parentItemId = data.parentItemId === existing.id ? null : await resolveParentItemId(data.parentItemId, existing.storeId);

    const item = await prisma.productIntelligenceItem.update({
      where: { id },
      data: {
        parentItemId,
        title,
        brand: optionalText(data.brand),
        category: optionalText(data.category),
        model: optionalText(data.model),
        productKind: normalizeEnum(data.productKind, PRODUCT_KIND_VALUES, existing.productKind),
        description: optionalText(data.description),
        imageUrl: optionalText(data.imageUrl),
        tags: parseTags(data.tags) ?? undefined,
        visibility: normalizeEnum(data.visibility, VISIBILITY_VALUES, existing.visibility),
        status: normalizeEnum(data.status, STATUS_VALUES, existing.status),
        updatedById: context.userId,
      },
    });

    revalidateProductIntelligence(item.id);
    return actionSuccess({ id: item.id });
  } catch (error) {
    return toActionFailure(error, "保存商品情报失败，请重试");
  }
}

function buildObservationCreateData(
  context: Awaited<ReturnType<typeof requireUserContext>>,
  data: Omit<ProductIntelligenceObservationInput, "itemId" | "storeId">
) {
  const amount = parseAmount(data.amount, "价格");
  const quantity = data.quantity ? parseAmount(data.quantity, "数量") : null;
  const currency = data.currency.trim().toUpperCase();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new Error("币种必须是 CNY、JPY、USD 或 EUR");
  }

  return {
    storeId: context.activeStoreId,
    sourceType: normalizeEnum(data.sourceType, SOURCE_TYPE_VALUES, "MANUAL"),
    priceType: normalizeEnum(data.priceType, PRICE_TYPE_VALUES, "SALE"),
    amount: amount.toFixed(4),
    currency,
    quantity: quantity?.toFixed(4) ?? null,
    sourceName: optionalText(data.sourceName),
    platformName: optionalText(data.platformName),
    conditionGrade: optionalText(data.conditionGrade),
    confidence: normalizeEnum(data.confidence, CONFIDENCE_VALUES, "MEDIUM"),
    visibility: normalizeEnum(data.visibility, VISIBILITY_VALUES, "PUBLIC"),
    observedAt: data.observedAt ?? new Date(),
    note: optionalText(data.note),
    createdById: context.userId,
  };
}

export async function addProductIntelligenceObservationAction(data: ProductIntelligenceObservationInput) {
  try {
    const item = await prisma.productIntelligenceItem.findUnique({ where: { id: data.itemId } });
    if (!item) throw new Error("商品情报不存在");
    const context = await requireUserContext(data.storeId ? { storeId: data.storeId } : undefined);
    const visibleItem = await prisma.productIntelligenceItem.findFirst({
      where: {
        id: data.itemId,
        ...itemVisibilityWhere(context.activeStoreId),
      },
      select: { id: true, parentItemId: true },
    });
    if (!visibleItem) throw new Error("无权为这条商品情报添加观察记录");
    if (!visibleItem.parentItemId) {
      throw new Error("商品组只作为父级容器，请选择具体 SKU 记录价格");
    }

    const observation = await prisma.productIntelligenceObservation.create({
      data: {
        itemId: data.itemId,
        ...buildObservationCreateData(context, data),
      },
    });

    await prisma.productIntelligenceItem.update({
      where: { id: data.itemId },
      data: { updatedById: context.userId },
    });

    revalidateProductIntelligence(data.itemId);
    return actionSuccess({ id: observation.id });
  } catch (error) {
    return toActionFailure(error, "添加观察记录失败，请重试");
  }
}

export async function deleteProductIntelligenceObservationAction(id: string, storeId?: string) {
  try {
    const observation = await prisma.productIntelligenceObservation.findUnique({ where: { id } });
    if (!observation) throw new Error("观察记录不存在");
    const context = await requireUserContext(storeId ? { storeId } : { storeId: observation.storeId });
    if (observation.storeId !== context.activeStoreId) {
      throw new Error("只能删除自己贡献的观察记录");
    }
    await prisma.productIntelligenceObservation.delete({ where: { id } });
    revalidateProductIntelligence(observation.itemId);
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除观察记录失败，请重试");
  }
}

export async function deleteProductIntelligenceItemAction(id: string, storeId?: string) {
  try {
    const item = await prisma.productIntelligenceItem.findUnique({ where: { id } });
    if (!item) throw new Error("商品情报不存在");
    const context = await requireUserContext(storeId ? { storeId } : { storeId: item.storeId });
    if (item.storeId !== context.activeStoreId) {
      throw new Error("只有贡献店铺可以删除这条商品情报");
    }
    await prisma.productIntelligenceItem.delete({ where: { id } });
    revalidateProductIntelligence();
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除商品情报失败，请重试");
  }
}

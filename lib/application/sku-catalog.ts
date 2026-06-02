import { prisma } from "@/lib/prisma";
import Decimal from "decimal.js";

export type CatalogStatus = "active" | "disabled";
export type ProductKind = "NEW" | "USED";

export interface SkuCatalogImage {
  url: string;
  isCover?: boolean;
}

export interface SkuNewFields {
  isSealed?: boolean;
  packagingStatus?: string;
  barcode?: string;
  defaultPurchaseUnit?: string;
  defaultSaleUnit?: string;
}

export interface SkuUsedFields {
  defaultConditionGrade?: string;
  defectNotes?: string;
  hasBox?: boolean;
  hasManual?: boolean;
  inspected?: boolean;
  inspectionNotes?: string;
}

/** 结构化字段，存于 SKU.attributes 下保留键 */
export interface SkuCatalogMeta {
  catalogStatus: CatalogStatus;
  productKind: ProductKind;
  referencePrice?: string | null;
  referenceCost?: string | null;
  currency?: string | null;
  tags?: string[];
  series?: string | null;
  notes?: string | null;
  images?: SkuCatalogImage[];
  newFields?: SkuNewFields;
  usedFields?: SkuUsedFields;
}

const RESERVED_KEYS = new Set([
  "catalogStatus",
  "productKind",
  "referencePrice",
  "referenceCost",
  "currency",
  "tags",
  "series",
  "notes",
  "images",
  "newFields",
  "usedFields",
]);

const DEFAULT_META: SkuCatalogMeta = {
  catalogStatus: "active",
  productKind: "NEW",
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickVariantAttributes(raw: Record<string, unknown>) {
  const variant: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!RESERVED_KEYS.has(key)) {
      variant[key] = value;
    }
  }
  return variant;
}

export function parseSkuCatalogMeta(
  attributes: unknown,
  imageUrl?: string | null
): SkuCatalogMeta & { variantAttributes: Record<string, unknown> } {
  const raw = asRecord(attributes);
  const images = Array.isArray(raw.images)
    ? raw.images
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const row = item as Record<string, unknown>;
          const url = typeof row.url === "string" ? row.url : "";
          if (!url) return null;
          return {
            url,
            isCover: Boolean(row.isCover),
          } satisfies SkuCatalogImage;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  if (images.length === 0 && imageUrl) {
    images.push({ url: imageUrl, isCover: true });
  }

  const coverIndex = images.findIndex((img) => img.isCover);
  if (images.length > 0 && coverIndex < 0) {
    images[0] = { ...images[0], isCover: true };
  }

  const catalogStatus =
    raw.catalogStatus === "disabled" ? "disabled" : DEFAULT_META.catalogStatus;
  const productKind = raw.productKind === "USED" ? "USED" : "NEW";

  return {
    catalogStatus,
    productKind,
    referencePrice:
      typeof raw.referencePrice === "string" ? raw.referencePrice : null,
    referenceCost: typeof raw.referenceCost === "string" ? raw.referenceCost : null,
    currency: typeof raw.currency === "string" ? raw.currency : null,
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((t): t is string => typeof t === "string")
      : [],
    series: typeof raw.series === "string" ? raw.series : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    images,
    newFields: asRecord(raw.newFields) as SkuNewFields,
    usedFields: asRecord(raw.usedFields) as SkuUsedFields,
    variantAttributes: pickVariantAttributes(raw),
  };
}

export function mergeSkuCatalogAttributes(
  existing: unknown,
  meta: Partial<SkuCatalogMeta>
): Record<string, unknown> {
  const parsed = parseSkuCatalogMeta(existing);
  const images =
    meta.images !== undefined
      ? meta.images
      : parsed.images?.map((img) => ({ ...img })) ?? [];

  const cover = images.find((img) => img.isCover) ?? images[0];
  if (cover) {
    for (const img of images) {
      img.isCover = img.url === cover.url;
    }
  }

  return {
    ...parsed.variantAttributes,
    catalogStatus: meta.catalogStatus ?? parsed.catalogStatus,
    productKind: meta.productKind ?? parsed.productKind,
    referencePrice: meta.referencePrice ?? parsed.referencePrice ?? undefined,
    referenceCost: meta.referenceCost ?? parsed.referenceCost ?? undefined,
    currency: meta.currency ?? parsed.currency ?? undefined,
    tags: meta.tags ?? parsed.tags,
    series: meta.series ?? parsed.series ?? undefined,
    notes: meta.notes ?? parsed.notes ?? undefined,
    images: images.length > 0 ? images : undefined,
    newFields: meta.newFields ?? parsed.newFields,
    usedFields: meta.usedFields ?? parsed.usedFields,
  };
}

export function resolveCoverImageUrl(meta: SkuCatalogMeta, fallback?: string | null) {
  const cover = meta.images?.find((img) => img.isCover) ?? meta.images?.[0];
  return cover?.url ?? fallback ?? null;
}

export interface SkuCatalogListItem {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  parentSkuId: string | null;
  variantCount: number;
  catalogStatus: CatalogStatus;
  productKind: ProductKind;
  referencePrice: string | null;
  currency: string | null;
  series: string | null;
}

export interface SkuCatalogDetail extends SkuCatalogListItem {
  description: string | null;
  meta: SkuCatalogMeta;
  variantAttributes: Record<string, unknown>;
  parentSku: { id: string; code: string; name: string } | null;
  childSkus: Array<{ id: string; code: string; name: string }>;
  reference: {
    sellableLotQty: string;
    availableItemUnits: number;
    activeListingCount: number;
    purchaseLineCount: number;
    salesLineCount: number;
    recentPurchaseLines: Array<{
      id: string;
      orderNo: string;
      quantity: string;
      unitPrice: string;
      currency: string;
    }>;
    recentSalesLines: Array<{
      id: string;
      orderNumber: string;
      quantity: string;
      lineAmount: string;
      currency: string;
    }>;
  };
}

export async function getSkuCatalogList(storeId: string): Promise<SkuCatalogListItem[]> {
  const skus = await prisma.sKU.findMany({
    where: { storeId },
    select: {
      id: true,
      code: true,
      name: true,
      brand: true,
      category: true,
      imageUrl: true,
      parentSkuId: true,
      attributes: true,
      _count: { select: { childSkus: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return skus.map((sku) => {
    const meta = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);
    return {
      id: sku.id,
      code: sku.code,
      name: sku.name,
      brand: sku.brand,
      category: sku.category,
      imageUrl: resolveCoverImageUrl(meta, sku.imageUrl),
      parentSkuId: sku.parentSkuId,
      variantCount: sku._count.childSkus,
      catalogStatus: meta.catalogStatus,
      productKind: meta.productKind,
      referencePrice: meta.referencePrice ?? null,
      currency: meta.currency ?? null,
      series: meta.series ?? null,
    };
  });
}

export async function getSkuCatalogDetail(id: string): Promise<SkuCatalogDetail | null> {
  const sku = await prisma.sKU.findUnique({
    where: { id },
    include: {
      parentSku: { select: { id: true, code: true, name: true } },
      childSkus: {
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      },
      listings: { where: { status: "ACTIVE" }, select: { id: true } },
      inventoryLots: { where: { status: "ACTIVE" }, select: { id: true } },
      itemUnits: {
        where: { status: "AVAILABLE" },
        select: { id: true },
      },
      purchaseLines: {
        take: 3,
        orderBy: { createdAt: "desc" },
        include: {
          purchaseOrder: { select: { orderNo: true, currency: true } },
        },
      },
      orderLines: {
        take: 3,
        where: {
          order: { orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] } },
        },
        orderBy: { createdAt: "desc" },
        include: {
          order: { select: { orderNumber: true, currency: true } },
        },
      },
      _count: {
        select: {
          purchaseLines: true,
          orderLines: true,
        },
      },
    },
  });

  if (!sku) return null;

  const lotIds = sku.inventoryLots.map((lot) => lot.id);
  const ledgers =
    lotIds.length > 0
      ? await prisma.stockLedger.findMany({
          where: { entityType: "LOT", entityId: { in: lotIds } },
          select: { entityId: true, deltaQty: true },
        })
      : [];

  let sellableLotQty = new Decimal(0);
  for (const lot of sku.inventoryLots) {
    const qty = ledgers
      .filter((l) => l.entityId === lot.id)
      .reduce((sum, l) => sum.plus(new Decimal(l.deltaQty.toString())), new Decimal(0));
    if (qty.gt(0)) sellableLotQty = sellableLotQty.plus(qty);
  }

  const parsed = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);

  return {
    id: sku.id,
    code: sku.code,
    name: sku.name,
    brand: sku.brand,
    category: sku.category,
    imageUrl: resolveCoverImageUrl(parsed, sku.imageUrl),
    parentSkuId: sku.parentSkuId,
    variantCount: sku.childSkus.length,
    catalogStatus: parsed.catalogStatus,
    productKind: parsed.productKind,
    referencePrice: parsed.referencePrice ?? null,
    currency: parsed.currency ?? null,
    series: parsed.series ?? null,
    description: sku.description,
    meta: parsed,
    variantAttributes: parsed.variantAttributes,
    parentSku: sku.parentSku,
    childSkus: sku.childSkus,
    reference: {
      sellableLotQty: sellableLotQty.toString(),
      availableItemUnits: sku.itemUnits.length,
      activeListingCount: sku.listings.length,
      purchaseLineCount: sku._count.purchaseLines,
      salesLineCount: sku._count.orderLines,
      recentPurchaseLines: sku.purchaseLines.map((line) => ({
        id: line.id,
        orderNo: line.purchaseOrder.orderNo,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toString(),
        currency: line.purchaseOrder.currency,
      })),
      recentSalesLines: sku.orderLines.map((line) => ({
        id: line.id,
        orderNumber: line.order.orderNumber,
        quantity: line.quantity.toString(),
        lineAmount: line.lineAmount.toString(),
        currency: line.order.currency,
      })),
    },
  };
}

export function productKindLabel(kind: ProductKind) {
  return kind === "USED" ? "中古" : "全新";
}

export function catalogStatusLabel(status: CatalogStatus) {
  return status === "disabled" ? "已停用" : "启用";
}

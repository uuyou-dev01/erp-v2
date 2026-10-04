import type { Prisma, PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { parseSkuCatalogMeta, resolveCoverImageUrl } from "@/lib/application/sku-catalog";
import { resolveProductCategory } from "@/lib/application/product-category-service";
import {
  buildSkuDisplayName,
  deriveCatalogRole,
  generateSkuCodeCandidate,
  normalizeCatalogRole,
  normalizeManufacturerCode,
  normalizeVariantLabel,
  type SkuCatalogRole,
  type SkuIdentitySource,
} from "@/lib/application/sku-identity";
type SkuCreateDb = PrismaClient | Prisma.TransactionClient;

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

export async function assertParentSkuInStore(
  parentSkuId: string | null | undefined,
  storeId: string,
  db: SkuCreateDb = prisma
) {
  if (!parentSkuId) return null;
  const parent = await db.sKU.findFirst({
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

export function normalizeIdentitySource(
  value: unknown,
  hasManualValue: boolean
): SkuIdentitySource {
  if (hasManualValue) return "MANUAL";
  return value === "MANUAL" ? "MANUAL" : "AUTO";
}

export function stringArrayFromJson(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export function normalizeStringArray(value: string[] | undefined) {
  const items = (value ?? []).map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

export function normalizeStringRecord(value: Record<string, string> | undefined) {
  const entries = Object.entries(value ?? {})
    .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
    .filter(([key, val]) => key && val);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export function stringRecordFromJson(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key.trim(), String(val ?? "").trim()] as const)
    .filter(([key, val]) => key && val);
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

export async function nextStoreSkuSequence(storeId: string, db: SkuCreateDb = prisma) {
  return (await db.sKU.count({ where: { storeId } })) + 1;
}

export async function ensureUniqueSkuCode(
  storeId: string,
  candidate: string,
  options: { ignoreId?: string; allowSuffix?: boolean } = {},
  db: SkuCreateDb = prisma
) {
  const base = candidate.trim();
  if (!base) throw new Error("SKU编码不能为空");

  let attempt = base;
  let suffix = 2;
  while (true) {
    const existing = await db.sKU.findUnique({
      where: { storeId_code: { storeId, code: attempt } },
      select: { id: true },
    });
    if (!existing || existing.id === options.ignoreId) return attempt;
    if (!options.allowSuffix) throw new Error("SKU代码已存在，请换一个编码");
    attempt = `${base}-${String(suffix).padStart(2, "0")}`;
    suffix += 1;
  }
}

export async function resolveSkuCreateIdentity(
  data: CreateSKUInput,
  storeId: string,
  organizationId: string,
  db: SkuCreateDb = prisma
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
    role === "VARIANT" ? await assertParentSkuInStore(data.parentSkuId, storeId, db) : null;
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
    db,
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
      : await nextStoreSkuSequence(storeId, db);
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
  const code = await ensureUniqueSkuCode(
    storeId,
    codeCandidate,
    {
      allowSuffix: !manualCode,
    },
    db
  );

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

export function validateSkuCatalogMeta(attributes: Record<string, unknown>, role?: SkuCatalogRole) {
  const meta = parseSkuCatalogMeta(attributes);
  for (const [label, value] of [
    ["参考售价", meta.referencePrice],
    ["目标进货价", meta.referenceCost],
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

  for (const [label, currency] of [
    ["售价币种", meta.referencePriceCurrency ?? meta.currency],
    ["进货价币种", meta.referenceCostCurrency ?? meta.currency],
  ] as const) {
    if (currency && !SUPPORTED_SKU_CURRENCIES.has(currency)) {
      throw new Error(`${label}必须是 CNY、JPY、USD 或 EUR`);
    }
  }

  if (role === "GROUP" && meta.physicalDetails) {
    throw new Error("商品组不能填写 SKU 详细信息，请在具体规格 SKU 中填写");
  }

  for (const [label, value] of [
    ["重量", meta.physicalDetails?.weightKg],
    ["长度", meta.physicalDetails?.lengthCm],
    ["宽度", meta.physicalDetails?.widthCm],
    ["高度", meta.physicalDetails?.heightCm],
  ] as const) {
    if (!value) continue;
    let decimal: Decimal;
    try {
      decimal = new Decimal(value);
    } catch {
      throw new Error(`${label}必须是有效数字`);
    }
    if (!decimal.isFinite() || decimal.lte(0)) {
      throw new Error(`${label}必须大于 0`);
    }
  }
}

export async function createSkuRecord(
  data: CreateSKUInput,
  context: { activeStoreId: string; organizationId: string },
  db: SkuCreateDb = prisma
) {
  const identity = await resolveSkuCreateIdentity(
    data,
    context.activeStoreId,
    context.organizationId,
    db
  );
  const attributes = {
    ...(data.attributes ?? {}),
    ...(identity.variantValues ?? {}),
  };
  validateSkuCatalogMeta(attributes, identity.role);
  const meta = parseSkuCatalogMeta(attributes, data.imageUrl);
  const imageUrl = resolveCoverImageUrl(meta, data.imageUrl) ?? data.imageUrl ?? null;

  const sku = await db.sKU.create({
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

  return sku;
}

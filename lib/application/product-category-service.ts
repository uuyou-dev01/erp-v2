import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SYSTEM_CATEGORY_ID_BY_LEGACY_NAME,
  SYSTEM_PRODUCT_CATEGORIES,
} from "@/lib/application/product-category-defaults";
import { categoryAliases, type ProductCategoryOption } from "@/lib/application/product-categories";

type CategoryDb =
  Pick<PrismaClient, "productCategory"> | Pick<Prisma.TransactionClient, "productCategory">;

function systemSeedMeta() {
  const byId = new Map(SYSTEM_PRODUCT_CATEGORIES.map((category) => [category.id, category]));
  const meta = new Map<string, { path: string; level: number }>();

  const resolve = (id: string): { path: string; level: number } => {
    const cached = meta.get(id);
    if (cached) return cached;
    const category = byId.get(id);
    if (!category) return { path: "", level: 0 };
    const parent = category.parentId ? resolve(category.parentId) : null;
    const value = {
      path: parent?.path ? `${parent.path} / ${category.name}` : category.name,
      level: parent ? parent.level + 1 : 0,
    };
    meta.set(id, value);
    return value;
  };

  for (const category of SYSTEM_PRODUCT_CATEGORIES) resolve(category.id);
  return meta;
}

const SYSTEM_META = systemSeedMeta();

export async function ensureSystemProductCategories(db: CategoryDb = prisma) {
  const count = await db.productCategory.count({
    where: { scope: "SYSTEM" },
  });
  if (count >= SYSTEM_PRODUCT_CATEGORIES.length) return;

  for (const category of SYSTEM_PRODUCT_CATEGORIES) {
    const meta = SYSTEM_META.get(category.id)!;
    await db.productCategory.upsert({
      where: { id: category.id },
      create: {
        id: category.id,
        scope: "SYSTEM",
        organizationId: null,
        parentId: category.parentId,
        canonicalCategoryId: null,
        code: category.code,
        name: category.name,
        aliases: category.aliases ?? [],
        path: meta.path,
        level: meta.level,
        sortOrder: category.sortOrder,
        status: "ACTIVE",
      },
      update: {
        parentId: category.parentId,
        code: category.code,
        name: category.name,
        aliases: category.aliases ?? [],
        path: meta.path,
        level: meta.level,
        sortOrder: category.sortOrder,
        status: "ACTIVE",
      },
    });
  }
}

export function serializeProductCategory(category: {
  id: string;
  scope: string;
  organizationId: string | null;
  parentId: string | null;
  canonicalCategoryId: string | null;
  code: string;
  name: string;
  aliases: unknown;
  path: string;
  level: number;
  sortOrder: number;
  status: string;
  _count?: { skus: number; intelligenceItems: number };
}): ProductCategoryOption {
  return {
    id: category.id,
    scope: category.scope === "SYSTEM" ? "SYSTEM" : "ORGANIZATION",
    organizationId: category.organizationId,
    parentId: category.parentId,
    canonicalCategoryId: category.canonicalCategoryId,
    code: category.code,
    name: category.name,
    aliases: categoryAliases(category.aliases),
    path: category.path,
    level: category.level,
    sortOrder: category.sortOrder,
    status:
      category.status === "INACTIVE" || category.status === "MERGED" ? category.status : "ACTIVE",
    skuCount: category._count?.skus,
    intelligenceCount: category._count?.intelligenceItems,
  };
}

export async function listVisibleProductCategories(
  organizationId: string,
  options: { includeInactive?: boolean; counts?: boolean } = {}
) {
  await ensureSystemProductCategories();
  const rows = await prisma.productCategory.findMany({
    where: {
      OR: [
        { scope: "SYSTEM", organizationId: null },
        { scope: "ORGANIZATION", organizationId },
      ],
      status: options.includeInactive ? { in: ["ACTIVE", "INACTIVE", "MERGED"] } : "ACTIVE",
    },
    include: options.counts
      ? { _count: { select: { skus: true, intelligenceItems: true } } }
      : undefined,
    orderBy: [{ scope: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(serializeProductCategory);
}

function customCategoryCode(organizationId: string, name: string) {
  const digest = createHash("sha1")
    .update(`${organizationId}:${name.trim().toLocaleLowerCase("zh-CN")}`)
    .digest("hex")
    .slice(0, 10)
    .toUpperCase();
  return `CUSTOM_${digest}`;
}

export async function resolveProductCategory(input: {
  organizationId: string;
  categoryId?: string | null;
  legacyName?: string | null;
  createLegacyCategory?: boolean;
  db?: CategoryDb;
}) {
  const db = input.db ?? prisma;
  await ensureSystemProductCategories(db);

  if (input.categoryId) {
    const selected = await db.productCategory.findFirst({
      where: {
        id: input.categoryId,
        status: "ACTIVE",
        OR: [
          { scope: "SYSTEM", organizationId: null },
          { scope: "ORGANIZATION", organizationId: input.organizationId },
        ],
      },
    });
    if (!selected) throw new Error("选择的商品品类不存在或不可用");
    return selected;
  }

  const legacyName = input.legacyName?.trim();
  if (!legacyName) return null;

  const knownSystemId = SYSTEM_CATEGORY_ID_BY_LEGACY_NAME[legacyName];
  if (knownSystemId) {
    return db.productCategory.findUnique({ where: { id: knownSystemId } });
  }

  const existing = await db.productCategory.findFirst({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      name: { equals: legacyName, mode: "insensitive" },
    },
  });
  if (existing) return existing;
  if (input.createLegacyCategory === false) return null;

  const canonicalCategoryId = SYSTEM_CATEGORY_ID_BY_LEGACY_NAME[legacyName] ?? "syscat_other";
  return db.productCategory.create({
    data: {
      scope: "ORGANIZATION",
      organizationId: input.organizationId,
      parentId: null,
      canonicalCategoryId,
      code: customCategoryCode(input.organizationId, legacyName),
      name: legacyName,
      aliases: [],
      path: legacyName,
      level: 0,
      sortOrder: 500,
      status: "ACTIVE",
    },
  });
}

export async function backfillLegacyProductCategories(organizationId: string) {
  await ensureSystemProductCategories();
  const stores = await prisma.store.findMany({
    where: { organizationId },
    select: { id: true },
  });
  const storeIds = stores.map((store) => store.id);
  if (storeIds.length === 0) return;

  const [skuRows, intelligenceRows] = await Promise.all([
    prisma.sKU.findMany({
      where: {
        storeId: { in: storeIds },
        categoryId: null,
        category: { not: null },
      },
      distinct: ["category"],
      select: { category: true },
    }),
    prisma.productIntelligenceItem.findMany({
      where: {
        storeId: { in: storeIds },
        categoryId: null,
        category: { not: null },
      },
      distinct: ["category"],
      select: { category: true },
    }),
  ]);

  const names = new Set(
    [...skuRows, ...intelligenceRows]
      .map((row) => row.category?.trim())
      .filter((name): name is string => Boolean(name))
  );

  for (const name of names) {
    const category = await resolveProductCategory({
      organizationId,
      legacyName: name,
    });
    if (!category) continue;
    await Promise.all([
      prisma.sKU.updateMany({
        where: {
          storeId: { in: storeIds },
          categoryId: null,
          category: name,
        },
        data: { categoryId: category.id },
      }),
      prisma.productIntelligenceItem.updateMany({
        where: {
          storeId: { in: storeIds },
          categoryId: null,
          category: name,
        },
        data: { categoryId: category.id },
      }),
    ]);
  }
}

export async function rebuildCategoryDescendantPaths(tx: Prisma.TransactionClient, rootId: string) {
  const root = await tx.productCategory.findUnique({
    where: { id: rootId },
    select: { id: true, name: true, path: true, level: true },
  });
  if (!root) return;

  const children = await tx.productCategory.findMany({
    where: { parentId: root.id },
    select: { id: true, name: true },
  });
  for (const child of children) {
    await tx.productCategory.update({
      where: { id: child.id },
      data: {
        path: `${root.path} / ${child.name}`,
        level: root.level + 1,
      },
    });
    await rebuildCategoryDescendantPaths(tx, child.id);
  }
}

"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import {
  backfillLegacyProductCategories,
  listVisibleProductCategories,
  rebuildCategoryDescendantPaths,
} from "@/lib/application/product-category-service";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

function aliasesFromInput(value?: string[] | string) {
  const items = Array.isArray(value) ? value : (value ?? "").split(/[,，、]/);
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function categoryCode(name: string) {
  const latin = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  if (latin) return latin;
  const digest = createHash("sha1").update(name).digest("hex").slice(0, 8);
  return `CATEGORY_${digest.toUpperCase()}`;
}

function revalidateCategoryConsumers() {
  revalidatePath("/settings/categories");
  revalidatePath("/inventory/skus");
  revalidatePath("/inventory/sellable");
  revalidatePath("/product-intelligence");
  revalidatePath("/procurement");
  revalidatePath("/workbench");
}

export async function getProductCategoryOptionsAction() {
  const context = await requireUserContext();
  await backfillLegacyProductCategories(context.organizationId);
  return listVisibleProductCategories(context.organizationId);
}

export async function getProductCategoryManagementData() {
  const context = await requireUserContext();
  await backfillLegacyProductCategories(context.organizationId);
  return {
    organizationId: context.organizationId,
    categories: await listVisibleProductCategories(context.organizationId, {
      includeInactive: true,
      counts: true,
    }),
  };
}

export async function createOrganizationCategoryAction(input: {
  name: string;
  parentId?: string | null;
  canonicalCategoryId?: string | null;
  aliases?: string[] | string;
}) {
  try {
    const context = await requireUserContext();
    const name = input.name.trim();
    if (!name) throw new Error("请填写品类名称");

    const parent = input.parentId
      ? await prisma.productCategory.findFirst({
          where: {
            id: input.parentId,
            OR: [
              { scope: "SYSTEM", organizationId: null },
              { scope: "ORGANIZATION", organizationId: context.organizationId },
            ],
            status: "ACTIVE",
          },
        })
      : null;
    if (input.parentId && !parent) throw new Error("父品类不存在或不可用");
    if ((parent?.level ?? -1) >= 3) throw new Error("品类最多支持 4 层");

    const canonical = input.canonicalCategoryId
      ? await prisma.productCategory.findFirst({
          where: {
            id: input.canonicalCategoryId,
            scope: "SYSTEM",
            status: "ACTIVE",
          },
        })
      : null;
    if (input.canonicalCategoryId && !canonical) {
      throw new Error("关联的系统标准品类不存在");
    }

    const duplicate = await prisma.productCategory.findFirst({
      where: {
        organizationId: context.organizationId,
        parentId: parent?.id ?? null,
        name: { equals: name, mode: "insensitive" },
        status: { not: "MERGED" },
      },
    });
    if (duplicate) throw new Error("同一层级已经存在同名品类");

    const baseCode = categoryCode(name);
    let code = baseCode;
    let sequence = 2;
    while (
      await prisma.productCategory.findFirst({
        where: { organizationId: context.organizationId, code },
        select: { id: true },
      })
    ) {
      code = `${baseCode}_${sequence}`;
      sequence += 1;
    }

    const category = await prisma.productCategory.create({
      data: {
        scope: "ORGANIZATION",
        organizationId: context.organizationId,
        parentId: parent?.id ?? null,
        canonicalCategoryId:
          canonical?.id ??
          (parent?.scope === "SYSTEM" ? parent.id : parent?.canonicalCategoryId) ??
          null,
        code,
        name,
        aliases: aliasesFromInput(input.aliases),
        path: parent ? `${parent.path} / ${name}` : name,
        level: parent ? parent.level + 1 : 0,
        sortOrder: parent ? parent.sortOrder + 1 : 500,
        status: "ACTIVE",
      },
    });
    revalidateCategoryConsumers();
    return actionSuccess({ id: category.id });
  } catch (error) {
    return toActionFailure(error, "创建品类失败，请重试");
  }
}

export async function updateOrganizationCategoryAction(input: {
  id: string;
  name: string;
  parentId?: string | null;
  canonicalCategoryId?: string | null;
  aliases?: string[] | string;
  status?: "ACTIVE" | "INACTIVE";
}) {
  try {
    const context = await requireUserContext();
    const existing = await prisma.productCategory.findFirst({
      where: {
        id: input.id,
        scope: "ORGANIZATION",
        organizationId: context.organizationId,
      },
    });
    if (!existing) throw new Error("企业品类不存在");
    const name = input.name.trim();
    if (!name) throw new Error("请填写品类名称");

    const parentId = input.parentId === undefined ? existing.parentId : input.parentId;
    if (parentId === existing.id) throw new Error("品类不能作为自己的父级");
    const parent = parentId
      ? await prisma.productCategory.findFirst({
          where: {
            id: parentId,
            OR: [
              { scope: "SYSTEM", organizationId: null },
              { scope: "ORGANIZATION", organizationId: context.organizationId },
            ],
            status: "ACTIVE",
          },
        })
      : null;
    if (parentId && !parent) throw new Error("父品类不存在或不可用");
    if ((parent?.level ?? -1) >= 3) throw new Error("品类最多支持 4 层");

    const organizationCategories = await prisma.productCategory.findMany({
      where: { organizationId: context.organizationId },
      select: { id: true, parentId: true },
    });
    const descendantIds = new Set<string>();
    const subtreeDepthOf = (id: string): number => {
      let depth = 0;
      for (const child of organizationCategories.filter((category) => category.parentId === id)) {
        if (descendantIds.has(child.id)) continue;
        descendantIds.add(child.id);
        depth = Math.max(depth, 1 + subtreeDepthOf(child.id));
      }
      return depth;
    };
    const subtreeDepth = subtreeDepthOf(existing.id);
    if (parent && descendantIds.has(parent.id)) {
      throw new Error("不能把品类移动到自己的下级");
    }
    if ((parent ? parent.level + 1 : 0) + subtreeDepth > 3) {
      throw new Error("移动后子品类将超过 4 层，请先调整子品类");
    }
    const duplicate = await prisma.productCategory.findFirst({
      where: {
        id: { not: existing.id },
        organizationId: context.organizationId,
        parentId: parent?.id ?? null,
        name: { equals: name, mode: "insensitive" },
        status: { not: "MERGED" },
      },
    });
    if (duplicate) throw new Error("同一层级已经存在同名品类");

    const canonical = input.canonicalCategoryId
      ? await prisma.productCategory.findFirst({
          where: {
            id: input.canonicalCategoryId,
            scope: "SYSTEM",
            status: "ACTIVE",
          },
        })
      : null;
    if (input.canonicalCategoryId && !canonical) {
      throw new Error("关联的系统标准品类不存在");
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.productCategory.update({
        where: { id: existing.id },
        data: {
          name,
          parentId: parent?.id ?? null,
          canonicalCategoryId: canonical?.id ?? (parent?.scope === "SYSTEM" ? parent.id : null),
          aliases: aliasesFromInput(input.aliases),
          path: parent ? `${parent.path} / ${name}` : name,
          level: parent ? parent.level + 1 : 0,
          status: input.status ?? existing.status,
        },
      });
      await rebuildCategoryDescendantPaths(tx, updated.id);
      await tx.sKU.updateMany({
        where: { categoryId: updated.id },
        data: { category: updated.name },
      });
      await tx.productIntelligenceItem.updateMany({
        where: { categoryId: updated.id },
        data: { category: updated.name },
      });
    });
    revalidateCategoryConsumers();
    return actionSuccess({ id: existing.id });
  } catch (error) {
    return toActionFailure(error, "保存品类失败，请重试");
  }
}

export async function mergeOrganizationCategoryAction(input: {
  sourceId: string;
  targetId: string;
}) {
  try {
    const context = await requireUserContext();
    if (input.sourceId === input.targetId) throw new Error("请选择不同的目标品类");
    const [source, target] = await Promise.all([
      prisma.productCategory.findFirst({
        where: {
          id: input.sourceId,
          scope: "ORGANIZATION",
          organizationId: context.organizationId,
        },
      }),
      prisma.productCategory.findFirst({
        where: {
          id: input.targetId,
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      }),
    ]);
    if (!source || !target) throw new Error("源品类或目标品类不存在");
    if (source.parentId === null && source.id === target.parentId) {
      throw new Error("不能合并到自己的直接下级");
    }

    await prisma.$transaction([
      prisma.sKU.updateMany({
        where: { categoryId: source.id },
        data: { categoryId: target.id, category: target.name },
      }),
      prisma.productIntelligenceItem.updateMany({
        where: { categoryId: source.id },
        data: { categoryId: target.id, category: target.name },
      }),
      prisma.productCategory.updateMany({
        where: { parentId: source.id },
        data: { parentId: target.id },
      }),
      prisma.productCategory.update({
        where: { id: source.id },
        data: { status: "MERGED", mergedIntoId: target.id },
      }),
    ]);
    revalidateCategoryConsumers();
    return actionSuccess({ id: target.id });
  } catch (error) {
    return toActionFailure(error, "合并品类失败，请重试");
  }
}

export async function deleteOrganizationCategoryAction(id: string) {
  try {
    const context = await requireUserContext();
    await prisma.$transaction(async (tx) => {
      // Lock the category before checking references; concurrent FK inserts must wait.
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM product_categories
        WHERE id = ${id} AND scope = 'ORGANIZATION'
          AND "organizationId" = ${context.organizationId}
        FOR UPDATE
      `;
      if (rows.length === 0) throw new Error("企业品类不存在或无权删除");
      const category = await tx.productCategory.findUniqueOrThrow({
        where: { id },
        include: {
          _count: {
            select: {
              children: true,
              skus: true,
              intelligenceItems: true,
              mergedCategories: true,
              mappedCategories: true,
            },
          },
        },
      });
      if (category._count.children > 0) {
        throw new Error("该品类下还有子品类，请先移动或删除子品类");
      }
      if (category._count.skus + category._count.intelligenceItems > 0) {
        throw new Error("该品类已被商品引用，请先调整商品分类，或将品类设为停用");
      }
      if (category._count.mergedCategories + category._count.mappedCategories > 0) {
        throw new Error("该品类仍被其他品类关联，请先解除关联或将品类设为停用");
      }
      await tx.productCategory.delete({ where: { id } });
    });
    revalidateCategoryConsumers();
    return actionSuccess({ id });
  } catch (error) {
    return toActionFailure(error, "删除品类失败，请重试");
  }
}

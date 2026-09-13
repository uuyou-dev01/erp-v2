import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensureSystemProductCategories } from "@/lib/application/product-category-service";

const context = vi.hoisted(() => ({ organizationId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/user-context", () => ({ requireUserContext: async () => context }));

import {
  createOrganizationCategoryAction,
  deleteOrganizationCategoryAction,
  updateOrganizationCategoryAction,
} from "@/app/actions/categories";

const runId = `category_actions_${Date.now()}`;
let otherOrgId: string;
let storeId: string;
const ids: string[] = [];

async function create(name: string, parentId?: string) {
  const result = await createOrganizationCategoryAction({ name, parentId });
  if (!result.success) throw new Error(result.error);
  ids.push(result.id);
  return prisma.productCategory.findUniqueOrThrow({ where: { id: result.id } });
}

describe("category structure actions", () => {
  beforeAll(async () => {
    await ensureSystemProductCategories();
    const org = await prisma.organization.create({ data: { code: runId, name: runId } });
    context.organizationId = org.id;
    const other = await prisma.organization.create({
      data: { code: `${runId}_other`, name: "Other organization" },
    });
    otherOrgId = other.id;
    const store = await prisma.store.create({
      data: { code: runId, name: runId, organizationId: org.id },
    });
    storeId = store.id;
  });

  afterAll(async () => {
    if (storeId) await prisma.store.delete({ where: { id: storeId } });
    // Remove leaves before parents because the tree intentionally restricts deletion.
    for (const id of [...ids].reverse()) await prisma.productCategory.deleteMany({ where: { id } });
    await prisma.organization.deleteMany({
      where: { id: { in: [context.organizationId, otherOrgId].filter(Boolean) } },
    });
  });

  it("creates real enterprise children beneath system and enterprise nodes", async () => {
    const parent = await create("运动配件", "syscat_apparel");
    expect(parent.parentId).toBe("syscat_apparel");
    expect(parent.canonicalCategoryId).toBe("syscat_apparel");
    expect(parent.path).toBe("鞋服 / 服装 / 运动配件");
    expect(parent.level).toBe(2);
    const child = await create("护腕", parent.id);
    expect(child.path).toBe(`${parent.path} / 护腕`);
    expect(child.canonicalCategoryId).toBe("syscat_apparel");
    expect(
      await createOrganizationCategoryAction({ name: "第五层", parentId: child.id })
    ).toMatchObject({ success: false, error: "品类最多支持 4 层" });
  });

  it("rejects duplicate sibling names and preserves another organization's boundaries", async () => {
    await create("重复品类");
    expect(await createOrganizationCategoryAction({ name: " 重复品类 " })).toMatchObject({
      success: false,
      error: "同一层级已经存在同名品类",
    });
    const foreign = await prisma.productCategory.create({
      data: { name: "外部品类", code: runId, path: "外部品类", organizationId: otherOrgId },
    });
    ids.push(foreign.id);
    expect(
      await createOrganizationCategoryAction({ name: "错误子品类", parentId: foreign.id })
    ).toMatchObject({ success: false });
    expect(await deleteOrganizationCategoryAction(foreign.id)).toMatchObject({ success: false });
    expect(await deleteOrganizationCategoryAction("syscat_apparel")).toMatchObject({
      success: false,
    });
  });

  it("deletes empty categories but refuses parents until their children are removed", async () => {
    const parent = await create("可删除父级");
    const child = await create("可删除子级", parent.id);
    expect(await deleteOrganizationCategoryAction(parent.id)).toMatchObject({
      success: false,
      error: expect.stringContaining("还有子品类"),
    });
    expect(await deleteOrganizationCategoryAction(child.id)).toMatchObject({ success: true });
    expect(await deleteOrganizationCategoryAction(parent.id)).toMatchObject({ success: true });
    expect(await prisma.productCategory.findUnique({ where: { id: parent.id } })).toBeNull();
  });

  it("refuses deletion when a SKU references the category, including inactive categories", async () => {
    const category = await create("已引用品类");
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: runId,
        name: "引用商品",
        category: category.name,
        categoryId: category.id,
      },
    });
    await prisma.productCategory.update({
      where: { id: category.id },
      data: { status: "INACTIVE" },
    });
    expect(await deleteOrganizationCategoryAction(category.id)).toMatchObject({
      success: false,
      error: expect.stringContaining("已被商品引用"),
    });
    expect((await prisma.sKU.findUniqueOrThrow({ where: { id: sku.id } })).categoryId).toBe(
      category.id
    );
  });

  it("refuses deletion when product intelligence references the category", async () => {
    const category = await create("情报品类");
    await prisma.productIntelligenceItem.create({
      data: { storeId, title: "情报商品", categoryId: category.id },
    });
    expect(await deleteOrganizationCategoryAction(category.id)).toMatchObject({
      success: false,
      error: expect.stringContaining("已被商品引用"),
    });
  });

  it("refuses deletion when another category uses it as a merge target", async () => {
    const target = await create("合并目标");
    const source = await create("合并来源");
    await prisma.productCategory.update({
      where: { id: source.id },
      data: { status: "MERGED", mergedIntoId: target.id },
    });
    expect(await deleteOrganizationCategoryAction(target.id)).toMatchObject({
      success: false,
      error: expect.stringContaining("其他品类关联"),
    });
  });

  it("moves and renames a subtree under a system category and rebuilds descendant paths", async () => {
    const parent = await create("待移动");
    const child = await create("下级", parent.id);
    expect(
      await updateOrganizationCategoryAction({
        id: parent.id,
        name: "移动后",
        parentId: "syscat_apparel",
      })
    ).toMatchObject({ success: true });
    const saved = await prisma.productCategory.findUniqueOrThrow({ where: { id: child.id } });
    expect(saved.path).toBe("鞋服 / 服装 / 移动后 / 下级");
    expect(saved.level).toBe(3);
    expect(
      await updateOrganizationCategoryAction({ id: parent.id, name: "循环", parentId: child.id })
    ).toMatchObject({ success: false });
  });

  it("does not confuse matching system and enterprise names with a cycle", async () => {
    const category = await create("鞋服");
    expect(
      await updateOrganizationCategoryAction({
        id: category.id,
        name: "企业服装",
        parentId: "syscat_apparel",
      })
    ).toMatchObject({ success: true });
  });

  it("rejects moves exceeding the depth limit and duplicate renames", async () => {
    const parent = await create("多层父级");
    const child = await create("多层子级", parent.id);
    await create("多层孙级", child.id);
    expect(
      await updateOrganizationCategoryAction({
        id: parent.id,
        name: parent.name,
        parentId: "syscat_apparel",
      })
    ).toMatchObject({ success: false, error: expect.stringContaining("超过 4 层") });
    const sibling = await create("同级重名");
    expect(
      await updateOrganizationCategoryAction({ id: sibling.id, name: parent.name })
    ).toMatchObject({ success: false, error: "同一层级已经存在同名品类" });
  });
});

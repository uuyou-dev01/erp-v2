import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { importCatalog } from "@/lib/catalog/import-service";
import { catalogImportSchema } from "@/lib/catalog/import-contract";
import { ensureSystemProductCategories } from "@/lib/application/product-category-service";
import * as skuCreate from "@/lib/application/sku-create-service";
import type { UserContext } from "@/lib/auth/user-context";

const run = `cli_${Date.now()}`;
let context: UserContext;
let categoryId: string;
let foreignCategoryId: string;
let otherOrgId: string;

function input(key: string) {
  return {
    schemaVersion: 1 as const,
    externalId: `${run}/${key}`,
    storeId: context.activeStoreId,
    product: {
      name: `${run} ${key}`,
      brand: "POP MART",
      categoryId,
      images: ["https://example.com/cover.jpg"],
      sourceUrls: ["https://example.com/product"],
    },
    variants: [
      {
        label: "小南",
        referencePrice: { amount: "1200", currency: "JPY" },
        observations: [
          {
            amount: "1100",
            currency: "JPY",
            sourceName: "测试来源",
            sourceUrl: "https://example.com/listing",
            observedAt: "2026-10-04T10:00:00+08:00",
          },
        ],
      },
      { label: "乔巴" },
    ],
  };
}

describe("agent catalog import", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { code: run, name: run } });
    const other = await prisma.organization.create({
      data: { code: `${run}_other`, name: "Other" },
    });
    otherOrgId = other.id;
    const store = await prisma.store.create({
      data: { organizationId: org.id, code: run, name: run },
    });
    const user = await prisma.user.create({
      data: { email: `${run}@example.com`, name: run, password: "test", storeId: store.id },
    });
    categoryId = (
      await prisma.productCategory.create({
        data: { organizationId: org.id, code: run, name: "盲盒", path: "盲盒" },
      })
    ).id;
    foreignCategoryId = (
      await prisma.productCategory.create({
        data: { organizationId: other.id, code: run, name: "Other", path: "Other" },
      })
    ).id;
    context = {
      userId: user.id,
      organizationId: org.id,
      organizationIds: [org.id],
      role: "OWNER",
      activeStoreId: store.id,
      storeIds: [store.id],
      inventoryPoolIds: [],
      salesChannelAccountIds: [],
      locationIds: [],
      activeInventoryPoolId: null,
    };
    await ensureSystemProductCategories();
  });
  afterAll(async () => {
    if (!context) return;
    await prisma.productIntelligenceObservation.deleteMany({
      where: { storeId: context.activeStoreId },
    });
    await prisma.productIntelligenceItem.deleteMany({ where: { storeId: context.activeStoreId } });
    await prisma.store.delete({ where: { id: context.activeStoreId } });
    await prisma.user.delete({ where: { id: context.userId } });
    await prisma.productCategory.deleteMany({
      where: { organizationId: { in: [context.organizationId, otherOrgId] } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [context.organizationId, otherOrgId] } },
    });
  });

  it("creates a group, named variants and sourced research without stock or orders", async () => {
    const result = await importCatalog(input("group"), context);
    expect(result.status).toBe("created");
    expect(result.observationCount).toBe(1);
    const group = await prisma.sKU.findUniqueOrThrow({ where: { id: result.product.id } });
    expect(group.catalogRole).toBe("GROUP");
    expect(group.variantAxes).toEqual(["款式"]);
    const variant = await prisma.sKU.findUniqueOrThrow({ where: { id: result.variants[0].id } });
    expect(variant.name).toBe(`${group.name} · 小南`);
    expect(variant.categoryId).toBe(categoryId);
    expect(variant.brand).toBe("POP MART");
    expect(variant.imageUrl).toBe("https://example.com/cover.jpg");
    expect(variant.attributes).toMatchObject({
      referencePrice: "1200",
      referencePriceCurrency: "JPY",
    });
    const observation = await prisma.productIntelligenceObservation.findFirstOrThrow({
      where: { item: { skuId: variant.id } },
    });
    expect(observation.amount.toString()).toBe("1100");
    expect(observation.sourceType).toBe("MARKET_SEEN");
    expect(observation.note).toContain("https://example.com/listing");
    expect(observation.visibility).toBe("ORGANIZATION");
    expect(observation.observedAt.toISOString()).toBe("2026-10-04T02:00:00.000Z");
    expect(
      await prisma.inventoryLot.count({
        where: { skuId: { in: [group.id, ...result.variants.map((v) => v.id)] } },
      })
    ).toBe(0);
  });

  it("rolls back all catalog and research writes for preview", async () => {
    const skuCount = await prisma.sKU.count({ where: { storeId: context.activeStoreId } });
    const researchCount = await prisma.productIntelligenceItem.count({
      where: { storeId: context.activeStoreId },
    });
    const result = await importCatalog(input("preview"), context, true);
    expect(result.status).toBe("preview");
    expect(result.product.id).toBe("(preview)");
    expect(result.href).toBeUndefined();
    expect(await prisma.sKU.count({ where: { storeId: context.activeStoreId } })).toBe(skuCount);
    expect(
      await prisma.productIntelligenceItem.count({ where: { storeId: context.activeStoreId } })
    ).toBe(researchCount);
  });

  it("deduplicates concurrent retries and ignores object key order", async () => {
    const payload = input("retry");
    const results = await Promise.all([
      importCatalog(payload, context),
      importCatalog(payload, context),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["created", "existing"]);
    expect(results[0].product.id).toBe(results[1].product.id);
    const reordered = {
      ...payload,
      product: {
        categoryId,
        brand: "POP MART",
        name: payload.product.name,
        sourceUrls: payload.product.sourceUrls,
        images: payload.product.images,
      },
    };
    expect((await importCatalog(reordered, context)).status).toBe("existing");
    expect(
      await prisma.productIntelligenceObservation.count({
        where: { item: { skuId: { in: results[0].variants.map((v) => v.id) } } },
      })
    ).toBe(1);
    await expect(
      importCatalog({ ...payload, variants: [{ label: "新规格" }] }, context)
    ).rejects.toMatchObject({ code: "IMPORT_CONFLICT" });
  });

  it("detects an existing product even when the external key changes", async () => {
    const payload = input("duplicate");
    await importCatalog(payload, context);
    await expect(
      importCatalog({ ...payload, externalId: `${run}/another-key` }, context)
    ).rejects.toMatchObject({ code: "PRODUCT_EXISTS" });
  });

  it("rejects foreign store, category and image references", async () => {
    await expect(
      importCatalog({ ...input("foreign"), storeId: "foreign-store" }, context)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const payload = input("foreign-category");
    payload.product.categoryId = foreignCategoryId;
    await expect(importCatalog(payload, context)).rejects.toMatchObject({
      code: "CATEGORY_NOT_FOUND",
    });
    const badImage = input("bad-image");
    badImage.product.images = ["/api/assets/foreign-asset/content"];
    await expect(importCatalog(badImage, context)).rejects.toMatchObject({
      code: "IMAGE_UNAVAILABLE",
    });
  });

  it("rolls back the parent and first variant if a later variant fails", async () => {
    const original = skuCreate.createSkuRecord;
    let calls = 0;
    const spy = vi.spyOn(skuCreate, "createSkuRecord").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 3) throw new Error("simulated write failure");
      return original(...args);
    });
    const payload = input("rollback");
    try {
      await expect(importCatalog(payload, context)).rejects.toThrow("simulated write failure");
    } finally {
      spy.mockRestore();
    }
    expect(
      await prisma.sKU.count({
        where: { storeId: context.activeStoreId, name: { startsWith: payload.product.name } },
      })
    ).toBe(0);
    expect(
      await prisma.productIntelligenceItem.count({
        where: { storeId: context.activeStoreId, title: payload.product.name },
      })
    ).toBe(0);
  });

  it("creates an independent SKU when variants are absent", async () => {
    const { variants: _, ...payload } = input("simple");
    const result = await importCatalog(payload, context);
    expect(result.variants).toEqual([]);
    expect(
      (await prisma.sKU.findUniqueOrThrow({ where: { id: result.product.id } })).catalogRole
    ).toBe("SIMPLE");
  });

  it("rejects typo fields, duplicate normalized variants and unsupported prices", () => {
    expect(
      catalogImportSchema.safeParse({ ...input("invalid"), variantAxis: "referencePrice" }).success
    ).toBe(false);
    expect(catalogImportSchema.safeParse({ ...input("invalid"), typo: true }).success).toBe(false);
    expect(
      catalogImportSchema.safeParse({
        ...input("invalid"),
        variants: [{ label: "Ａ" }, { label: "a" }],
      }).success
    ).toBe(false);
    for (const amount of ["-1", "NaN", "1e4", "1.12345", "1000000000000000", 1200]) {
      expect(
        catalogImportSchema.safeParse({
          ...input("invalid"),
          variants: [{ label: "A", referencePrice: { amount, currency: "JPY" } }],
        }).success
      ).toBe(false);
    }
    expect(
      catalogImportSchema.safeParse({
        ...input("invalid"),
        variants: [{ label: "A", referencePrice: { amount: "1", currency: "GBP" } }],
      }).success
    ).toBe(false);
  });
});

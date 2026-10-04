import { createHash } from "node:crypto";
import type { Prisma, SKU } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { UserContext } from "@/lib/auth/user-context";
import { createSkuRecord } from "@/lib/application/sku-create-service";
import { normalizeManufacturerCode } from "@/lib/application/sku-identity";
import { catalogImportSchema, type CatalogImport } from "./import-contract";
import { CatalogError } from "./http";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonicalJson(val)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

type Summary = { id: string; code: string; name: string };
type ImportResult = {
  status: "created" | "existing" | "preview";
  externalId: string;
  product: Summary;
  variants: Summary[];
  observationCount: number;
  href?: string;
};
class PreviewRollback extends Error {
  constructor(public result: ImportResult) {
    super("preview rollback");
  }
}
const summary = ({ id, code, name }: SKU): Summary => ({ id, code, name });

function metadata(
  details: CatalogImport["product"] | CatalogImport["variants"][number],
  input: CatalogImport
) {
  return {
    productKind: input.product.productKind,
    catalogStatus: "active",
    series: input.product.series,
    tags: input.product.tags,
    images: details.images.map((url, i) => ({ url, isCover: i === 0 })),
    referencePrice: details.referencePrice?.amount,
    referencePriceCurrency: details.referencePrice?.currency,
    referenceCost: details.referenceCost?.amount,
    referenceCostCurrency: details.referenceCost?.currency,
    notes: [details.notes, ...details.sourceUrls.map((url) => `调查来源：${url}`)]
      .filter(Boolean)
      .join("\n"),
  };
}

async function createResearch(
  tx: Prisma.TransactionClient,
  sku: SKU,
  details: CatalogImport["product"] | CatalogImport["variants"][number],
  context: UserContext,
  parentItemId?: string
) {
  const item = await tx.productIntelligenceItem.create({
    data: {
      storeId: sku.storeId,
      skuId: sku.id,
      parentItemId,
      title: sku.variantLabel || sku.name,
      brand: sku.brand,
      categoryId: sku.categoryId,
      category: sku.category,
      productKind: ((sku.attributes as Record<string, unknown>)?.productKind as string) || "NEW",
      imageUrl: sku.imageUrl,
      description: sku.description,
      visibility: "ORGANIZATION",
      createdById: context.userId,
    },
  });
  if (details.observations.length)
    await tx.productIntelligenceObservation.createMany({
      data: details.observations.map((o) => ({
        itemId: item.id,
        storeId: sku.storeId,
        amount: o.amount,
        currency: o.currency,
        priceType: o.priceType,
        sourceType: "MARKET_SEEN",
        sourceName: o.sourceName,
        observedAt: new Date(o.observedAt),
        confidence: o.confidence,
        note: [o.note, `调查来源：${o.sourceUrl}`].filter(Boolean).join("\n"),
        visibility: "ORGANIZATION",
        createdById: context.userId,
      })),
    });
  return item;
}

/** Context must be resolved by the authenticated HTTP boundary, never from the payload. */
export async function importCatalog(
  raw: unknown,
  context: UserContext,
  dryRun = false
): Promise<ImportResult> {
  const input = catalogImportSchema.parse(raw);
  if (input.storeId !== context.activeStoreId || !context.storeIds.includes(input.storeId))
    throw new CatalogError("FORBIDDEN", "无权导入到此店铺", 403);
  const fingerprint = createHash("sha256").update(canonicalJson(input)).digest("hex");
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Serialize CLI imports in this store; the same key cannot create two bundles concurrently.
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`catalog-import:${input.storeId}`}, 0))`;
        const existing = await tx.sKU.findFirst({
          where: {
            storeId: input.storeId,
            parentSkuId: null,
            attributes: { path: ["agentImport", "externalId"], equals: input.externalId },
          },
          include: { childSkus: { orderBy: { code: "asc" } } },
        });
        if (existing) {
          const stored = (existing.attributes as Record<string, unknown>).agentImport as {
            fingerprint?: string;
          };
          if (stored?.fingerprint !== fingerprint)
            throw new CatalogError(
              "IMPORT_CONFLICT",
              "externalId 已使用但内容不同；请检查已有商品，不能更换 externalId 绕过冲突",
              409
            );
          return {
            status: "existing",
            externalId: input.externalId,
            product: summary(existing),
            variants: existing.childSkus.map(summary),
            observationCount: 0,
            href: `/inventory/skus/${existing.id}`,
          };
        }
        const category = await tx.productCategory.findFirst({
          where: {
            id: input.product.categoryId,
            status: "ACTIVE",
            OR: [
              { scope: "SYSTEM", organizationId: null },
              { scope: "ORGANIZATION", organizationId: context.organizationId },
            ],
          },
        });
        if (!category)
          throw new CatalogError("CATEGORY_NOT_FOUND", "品类不存在或不可用，请先查询 categories");
        const duplicate = await tx.sKU.findFirst({
          where: {
            storeId: input.storeId,
            parentSkuId: null,
            OR: [
              {
                name: { equals: input.product.name, mode: "insensitive" },
                brand: { equals: input.product.brand, mode: "insensitive" },
              },
              ...(input.product.manufacturerCode
                ? [
                    {
                      manufacturerCode: normalizeManufacturerCode(input.product.manufacturerCode),
                      brand: { equals: input.product.brand, mode: "insensitive" as const },
                    },
                  ]
                : []),
            ],
          },
          select: { id: true, code: true },
        });
        if (duplicate)
          throw new CatalogError(
            "PRODUCT_EXISTS",
            `发现已有商品 ${duplicate.code} (${duplicate.id})，请检查后使用已有商品`,
            409
          );
        const localImageIds = [...input.product.images, ...input.variants.flatMap((v) => v.images)]
          .filter((url) => url.startsWith("/api/assets/"))
          .map((url) => url.split("/")[3]);
        if (localImageIds.length) {
          const allowed = await tx.mobileAsset.count({
            where: {
              id: { in: [...new Set(localImageIds)] },
              status: "READY",
              organizationId: context.organizationId,
              storeId: input.storeId,
              purpose: "CATALOG_IMAGE",
            },
          });
          if (allowed !== new Set(localImageIds).size)
            throw new CatalogError("IMAGE_UNAVAILABLE", "上传图片不存在、未就绪或不属于此店铺");
        }
        const product = await createSkuRecord(
          {
            storeId: input.storeId,
            name: input.product.name,
            brand: input.product.brand,
            categoryId: category.id,
            manufacturerCode: input.product.manufacturerCode,
            catalogRole: input.variants.length ? "GROUP" : "SIMPLE",
            variantAxes: input.variants.length ? [input.variantAxis] : undefined,
            description: input.product.description,
            imageUrl: input.product.images[0],
            attributes: {
              ...metadata(input.product, input),
              agentImport: {
                externalId: input.externalId,
                fingerprint,
                userId: context.userId,
                schemaVersion: 1,
              },
            },
          },
          context,
          tx
        );
        const researchParent = await createResearch(tx, product, input.product, context);
        const variants: Summary[] = [];
        for (const variant of input.variants) {
          const sku = await createSkuRecord(
            {
              storeId: input.storeId,
              catalogRole: "VARIANT",
              parentSkuId: product.id,
              variantLabel: variant.label,
              variantValues: { [input.variantAxis]: variant.label },
              description: variant.description,
              imageUrl: variant.images[0] || input.product.images[0],
              attributes: metadata(variant, input),
            },
            context,
            tx
          );
          variants.push(summary(sku));
          await createResearch(tx, sku, variant, context, researchParent.id);
        }
        const result: ImportResult = {
          status: dryRun ? "preview" : "created",
          externalId: input.externalId,
          product: summary(product),
          variants,
          observationCount:
            input.product.observations.length +
            input.variants.reduce((n, v) => n + v.observations.length, 0),
          href: `/inventory/skus/${product.id}`,
        };
        if (dryRun) {
          // Preview executes identical checks and rolls back every catalog/research write.
          delete result.href;
          result.product.id = "(preview)";
          result.variants.forEach((v) => {
            v.id = "(preview)";
          });
          throw new PreviewRollback(result);
        }
        return result;
      },
      { timeout: 30_000, maxWait: 10_000 }
    );
  } catch (error) {
    if (error instanceof PreviewRollback) return error.result;
    throw error;
  }
}

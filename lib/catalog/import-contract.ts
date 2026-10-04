import { z } from "zod";

const text = z.string().trim().min(1).max(300);
const money = z
  .string()
  .regex(/^(0|[1-9]\d{0,14})(\.\d{1,4})?$/, "金额须为非负十进制字符串，最多四位小数");
const currency = z.enum(["CNY", "JPY", "USD", "EUR"]);
const webUrl = z
  .string()
  .max(2048)
  .url()
  .refine((v) => /^https?:\/\//.test(v), "仅支持 HTTP(S) 地址");
const imageUrl = z.union([webUrl, z.string().regex(/^\/api\/assets\/[A-Za-z0-9_-]+\/content$/)]);
const price = z.object({ amount: money, currency }).strict();
const observation = z
  .object({
    amount: money,
    currency,
    priceType: z.enum(["SALE", "PURCHASE", "WHOLESALE", "RESALE", "OFFER"]).default("SALE"),
    sourceUrl: webUrl,
    sourceName: text,
    observedAt: z.string().datetime({ offset: true }),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    note: z.string().trim().max(4000).optional(),
  })
  .strict();

const details = {
  description: z.string().trim().max(10000).optional(),
  images: z.array(imageUrl).max(12).default([]),
  referencePrice: price.optional(),
  referenceCost: price.optional(),
  sourceUrls: z.array(webUrl).max(20).default([]),
  observations: z.array(observation).max(30).default([]),
  notes: z.string().trim().max(4000).optional(),
};

export const catalogImportSchema = z
  .object({
    schemaVersion: z.literal(1),
    externalId: z
      .string()
      .trim()
      .min(1)
      .max(150)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, "使用稳定的品牌/系列标识，不要每次随机生成"),
    storeId: text,
    product: z
      .object({
        name: text,
        brand: text,
        categoryId: text,
        manufacturerCode: text.optional(),
        series: text.optional(),
        tags: z.array(text).max(20).default([]),
        productKind: z.enum(["NEW", "USED"]).default("NEW"),
        ...details,
      })
      .strict(),
    variantAxis: text.default("款式"),
    variants: z
      .array(z.object({ label: text, ...details }).strict())
      .max(100)
      .default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    const reservedAxes = new Set([
      "__proto__",
      "constructor",
      "prototype",
      "catalogStatus",
      "productKind",
      "barcode",
      "referencePrice",
      "referenceCost",
      "referencePriceCurrency",
      "referenceCostCurrency",
      "currency",
      "tags",
      "series",
      "notes",
      "images",
      "physicalDetails",
      "newFields",
      "usedFields",
      "agentImport",
    ]);
    if (reservedAxes.has(data.variantAxis))
      ctx.addIssue({
        code: "custom",
        path: ["variantAxis"],
        message: "规格维度不能使用系统字段名",
      });
    const seen = new Set<string>();
    data.variants.forEach((variant, index) => {
      const key = variant.label.normalize("NFKC").toLowerCase();
      if (seen.has(key))
        ctx.addIssue({
          code: "custom",
          path: ["variants", index, "label"],
          message: "规格名称重复",
        });
      seen.add(key);
    });
  });

export type CatalogImport = z.infer<typeof catalogImportSchema>;

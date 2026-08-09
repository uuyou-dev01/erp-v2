import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSkuCatalogMeta } from "@/lib/application/sku-catalog";

export const SKU_MATCHER = "DETERMINISTIC_SKU";
export const SKU_MATCHER_VERSION = "1";

export interface SkuMatchHints {
  query?: string;
  brand?: string;
  variant?: string;
  barcode?: string;
  manufacturerCode?: string;
}

export interface SkuMatchResult {
  skuId: string;
  code: string;
  name: string;
  parentName: string | null;
  variantLabel: string | null;
  brand: string | null;
  imageUrl: string | null;
  barcode: string | null;
  manufacturerCode: string | null;
  score: number;
  reasons: string[];
  latestMarketPrice?: string | null;
  latestMarketCurrency?: string | null;
  latestPurchasePrice?: string | null;
  purchaseVsMarketRate?: number | null;
}

export function normalizeSkuMatchText(value?: string | null) {
  return (value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[·•・]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokens(value?: string | null) {
  return [...new Set(normalizeSkuMatchText(value).split(" ").filter(Boolean))];
}

function tokenCoverage(needle: string[], haystack: string[]) {
  if (!needle.length) return 0;
  const haystackSet = new Set(haystack);
  return needle.filter((token) => haystackSet.has(token)).length / needle.length;
}

export function scoreSkuCandidate(
  sku: {
    id: string;
    code: string;
    name: string;
    brand: string | null;
    manufacturerCode: string | null;
    variantLabel: string | null;
    imageUrl: string | null;
    attributes: Prisma.JsonValue | null;
    parentSku: { name: string } | null;
    aliases: Array<{ alias: string }>;
  },
  hints: SkuMatchHints
): SkuMatchResult | null {
  const query = normalizeSkuMatchText(hints.query);
  const brand = normalizeSkuMatchText(hints.brand);
  const variant = normalizeSkuMatchText(hints.variant);
  const barcodeHint = normalizeSkuMatchText(hints.barcode);
  const manufacturerHint = normalizeSkuMatchText(hints.manufacturerCode);
  const meta = parseSkuCatalogMeta(sku.attributes, sku.imageUrl);
  const barcode = normalizeSkuMatchText(meta.barcode);
  const code = normalizeSkuMatchText(sku.code);
  const manufacturerCode = normalizeSkuMatchText(sku.manufacturerCode);
  const name = normalizeSkuMatchText(sku.name);
  const parentName = normalizeSkuMatchText(sku.parentSku?.name);
  const variantLabel = normalizeSkuMatchText(sku.variantLabel);
  const aliases = sku.aliases.map((item) => normalizeSkuMatchText(item.alias)).filter(Boolean);
  const reasons: string[] = [];
  let score = 0;

  if (barcodeHint && barcodeHint === barcode) {
    score = 1;
    reasons.push("条码完全一致");
  } else if (manufacturerHint && manufacturerHint === manufacturerCode) {
    score = 0.99;
    reasons.push("厂商款号完全一致");
  } else if (query && query === code) {
    score = 0.99;
    reasons.push("SKU 编码完全一致");
  } else if (query && aliases.includes(query)) {
    score = 0.97;
    reasons.push("已确认别名完全一致");
  } else if (query && (query === name || query === `${parentName} ${variantLabel}`.trim())) {
    score = 0.96;
    reasons.push("商品名称和规格完全一致");
  } else {
    const queryTokens = tokens([hints.query, hints.brand, hints.variant].filter(Boolean).join(" "));
    const targetTokens = tokens([sku.code, sku.name, sku.parentSku?.name, sku.brand, sku.variantLabel, sku.manufacturerCode, meta.barcode, ...sku.aliases.map((item) => item.alias)].filter(Boolean).join(" "));
    const coverage = tokenCoverage(queryTokens, targetTokens);
    score = coverage * 0.82;
    if (coverage > 0) reasons.push(`关键词覆盖 ${Math.round(coverage * 100)}%`);
    if (brand && brand === normalizeSkuMatchText(sku.brand)) {
      score += 0.08;
      reasons.push("品牌一致");
    }
    if (variant && (variant === variantLabel || name.includes(variant))) {
      score += 0.08;
      reasons.push("规格一致");
    }
    if (query && (name.includes(query) || code.includes(query) || parentName.includes(query))) {
      score = Math.max(score, 0.84);
      reasons.push("名称或编码包含输入内容");
    }
  }
  score = Math.min(1, Math.max(0, score));
  if (score < 0.2 && (query || brand || variant || barcodeHint || manufacturerHint)) return null;
  return {
    skuId: sku.id,
    code: sku.code,
    name: sku.name,
    parentName: sku.parentSku?.name ?? null,
    variantLabel: sku.variantLabel,
    brand: sku.brand,
    imageUrl: meta.images?.find((image) => image.isCover)?.url || sku.imageUrl,
    barcode: meta.barcode ?? null,
    manufacturerCode: sku.manufacturerCode,
    score,
    reasons: reasons.length ? reasons : ["最近更新的正式 SKU"],
  };
}

export async function searchOperationalSkus(storeId: string, hints: SkuMatchHints, limit = 8) {
  const skus = await prisma.sKU.findMany({
    where: {
      storeId,
      catalogRole: { in: ["SIMPLE", "VARIANT"] },
      OR: [{ mergeStatus: null }, { mergeStatus: { not: "MERGED" } }],
    },
    include: { parentSku: { select: { name: true } }, aliases: { select: { alias: true } } },
    orderBy: { updatedAt: "desc" },
    take: 1000,
  });
  const hasHints = Object.values(hints).some((value) => value?.trim());
  const ranked = skus
    .map((sku) => scoreSkuCandidate(sku, hints))
    .filter((candidate): candidate is SkuMatchResult => Boolean(candidate))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-CN"))
    .slice(0, Math.min(Math.max(limit, 1), 20))
    .map((candidate, index) => ({ ...candidate, score: hasHints ? candidate.score : Math.max(0.1, 0.3 - index * 0.01) }));
  if (!ranked.length) return ranked;
  const observations = await prisma.productIntelligenceObservation.findMany({
    where: { item: { skuId: { in: ranked.map((candidate) => candidate.skuId) } }, sourceType: { in: ["MARKET_SEEN", "REAL_PURCHASE"] } },
    select: { item: { select: { skuId: true } }, sourceType: true, amount: true, currency: true, observedAt: true },
    orderBy: { observedAt: "desc" },
  });
  const insights = new Map<string, { market?: { amount: string; currency: string }; purchase?: { amount: string; currency: string } }>();
  for (const observation of observations) {
    const skuId = observation.item.skuId;
    if (!skuId) continue;
    const insight = insights.get(skuId) || {};
    if (observation.sourceType === "MARKET_SEEN" && !insight.market) insight.market = { amount: observation.amount.toString(), currency: observation.currency };
    if (observation.sourceType === "REAL_PURCHASE" && !insight.purchase) insight.purchase = { amount: observation.amount.toString(), currency: observation.currency };
    insights.set(skuId, insight);
  }
  return ranked.map((candidate) => {
    const insight = insights.get(candidate.skuId);
    const comparable = insight?.market && insight.purchase && insight.market.currency === insight.purchase.currency;
    return {
      ...candidate,
      latestMarketPrice: insight?.market?.amount ?? null,
      latestMarketCurrency: insight?.market?.currency ?? null,
      latestPurchasePrice: insight?.purchase?.amount ?? null,
      purchaseVsMarketRate: comparable
        ? (Number(insight!.purchase!.amount) - Number(insight!.market!.amount)) / Number(insight!.market!.amount)
        : null,
    };
  });
}

export async function requireOperationalSku(storeId: string, skuId: string) {
  const sku = await prisma.sKU.findFirst({
    where: { id: skuId, storeId, catalogRole: { in: ["SIMPLE", "VARIANT"] }, OR: [{ mergeStatus: null }, { mergeStatus: { not: "MERGED" } }] },
    include: { parentSku: true },
  });
  if (!sku) throw new Error("所选正式 SKU 不存在、已合并或无权访问");
  return sku;
}

export async function ensureIntelligenceVariantForSku(input: {
  storeId: string;
  skuId: string;
  userId: string;
}) {
  const existing = await prisma.productIntelligenceItem.findFirst({
    where: { storeId: input.storeId, skuId: input.skuId, parentItemId: { not: null } },
  });
  if (existing) return existing;
  const sku = await requireOperationalSku(input.storeId, input.skuId);
  const parentSku = sku.parentSkuId
    ? await prisma.sKU.findUnique({ where: { id: sku.parentSkuId } })
    : null;
  const parentTitle = parentSku?.name || sku.name;
  let parent = parentSku
    ? await prisma.productIntelligenceItem.findFirst({ where: { storeId: input.storeId, skuId: parentSku.id, parentItemId: null } })
    : await prisma.productIntelligenceItem.findFirst({ where: { storeId: input.storeId, parentItemId: null, title: parentTitle } });
  if (!parent) {
    parent = await prisma.productIntelligenceItem.create({
      data: {
        storeId: input.storeId,
        skuId: parentSku?.id,
        title: parentTitle,
        brand: sku.brand || parentSku?.brand,
        category: sku.category || parentSku?.category,
        categoryId: sku.categoryId || parentSku?.categoryId,
        imageUrl: parentSku?.imageUrl || sku.imageUrl,
        visibility: "ORGANIZATION",
        createdById: input.userId,
      },
    });
  }
  return prisma.productIntelligenceItem.create({
    data: {
      storeId: input.storeId,
      parentItemId: parent.id,
      skuId: sku.id,
      title: sku.variantLabel || (sku.catalogRole === "SIMPLE" ? "标准款" : sku.name),
      brand: sku.brand,
      category: sku.category,
      categoryId: sku.categoryId,
      imageUrl: sku.imageUrl,
      visibility: "ORGANIZATION",
      createdById: input.userId,
    },
  });
}

export async function saveSkuAlias(input: {
  storeId: string;
  skuId: string;
  alias?: string | null;
  userId?: string | null;
  source?: string;
}) {
  const normalizedAlias = normalizeSkuMatchText(input.alias);
  if (!normalizedAlias) return null;
  await requireOperationalSku(input.storeId, input.skuId);
  return prisma.skuAlias.upsert({
    where: {
      storeId_normalizedAlias_skuId: {
        storeId: input.storeId,
        normalizedAlias,
        skuId: input.skuId,
      },
    },
    create: {
      storeId: input.storeId,
      skuId: input.skuId,
      alias: input.alias!.trim(),
      normalizedAlias,
      source: input.source || "CAPTURE_ACCEPTED",
      createdById: input.userId,
    },
    update: { alias: input.alias!.trim(), source: input.source || "CAPTURE_ACCEPTED" },
  });
}

export async function persistCaptureSkuCandidates(input: {
  captureId: string;
  storeId: string;
  hints: SkuMatchHints;
  limit?: number;
}) {
  const candidates = await searchOperationalSkus(input.storeId, input.hints, input.limit ?? 8);
  await prisma.$transaction(async (tx) => {
    await tx.matchCandidate.deleteMany({
      where: { captureId: input.captureId, matcher: SKU_MATCHER, matcherVersion: SKU_MATCHER_VERSION },
    });
    if (candidates.length) {
      await tx.matchCandidate.createMany({
        data: candidates.map((candidate) => ({
          captureId: input.captureId,
          skuId: candidate.skuId,
          score: candidate.score.toFixed(4),
          reasons: candidate.reasons,
          matcher: SKU_MATCHER,
          matcherVersion: SKU_MATCHER_VERSION,
        })),
      });
    }
  });
  return candidates;
}

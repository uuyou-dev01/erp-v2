import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import {
  createAndProcessQuickEntry,
  createGroupedPurchaseQuickEntries,
  type QuickEntryRowInput,
} from "@/lib/application/quick-entry";
import {
  ensureIntelligenceVariantForSku,
  persistCaptureSkuCandidates,
  requireOperationalSku,
  saveSkuAlias,
  SKU_MATCHER,
  SKU_MATCHER_VERSION,
} from "@/lib/capture/sku-matching";
import { resolveCapturePlatform } from "@/lib/capture/platform-adapters";

const CURRENCIES = new Set(["CNY", "JPY", "USD", "HKD", "EUR", "GBP"]);
const VISIBILITIES = new Set(["PUBLIC", "ORGANIZATION", "PRIVATE"]);

export interface CaptureEvidenceInput {
  captureType?: string;
  businessIntent: "OBSERVE_PRICE" | "RECORD_PURCHASE" | "UNDECIDED";
  idempotencyKey?: string;
  sourceUrl?: string;
  sourceText?: string;
  platformName?: string;
  externalListingId?: string;
  title?: string;
  amount?: string;
  currency?: string;
  conditionText?: string;
  visibility?: string;
  capturedAt?: string;
  rawPayload?: Prisma.InputJsonValue;
  assetIds?: string[];
}

export interface ConfirmObservationInput extends CaptureEvidenceInput {
  businessIntent: "OBSERVE_PRICE";
  itemId?: string;
  skuId?: string;
  note?: string;
}

export interface PurchaseCaptureLineInput {
  itemId?: string;
  skuId?: string;
  resolutionMode?: "EXISTING" | "CREATE_PENDING";
  brand?: string;
  productName: string;
  variant?: string;
  category?: string;
  conditionType?: string;
  quantity: string;
  unitPrice: string;
  note?: string;
}

export interface ConfirmPurchaseInput extends CaptureEvidenceInput {
  businessIntent: "RECORD_PURCHASE";
  supplierName?: string;
  externalOrderNo?: string;
  purchasedAt?: string;
  shippingFee?: string;
  currentLocationText?: string;
  trackingNo?: string;
  note?: string;
  lines: PurchaseCaptureLineInput[];
}

export function normalizeCaptureUrl(raw?: string | null) {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|spm$|from$|source$|share_|share$|timestamp$)/i.test(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("来源链接格式不正确");
  }
}

export function inferCapturePlatform(sourceUrl?: string | null, hint?: string | null) {
  return resolveCapturePlatform({ normalizedUrl: sourceUrl, platformHint: hint }).platformName;
}

function positiveDecimal(value: string | undefined, label: string) {
  try {
    const decimal = new Decimal(value || "");
    if (!decimal.isFinite() || decimal.lte(0)) throw new Error();
    return decimal.toFixed(4);
  } catch {
    throw new Error(`${label}必须是大于 0 的数字`);
  }
}

function optionalNonNegativeDecimal(value: string | undefined, label: string) {
  if (!value?.trim()) return null;
  try {
    const decimal = new Decimal(value);
    if (!decimal.isFinite() || decimal.lt(0)) throw new Error();
    return decimal.toFixed(4);
  } catch {
    throw new Error(`${label}必须是有效的非负数字`);
  }
}

function captureDate(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("日期格式不正确");
  return date;
}

function normalizeCurrency(value?: string) {
  const currency = value?.trim().toUpperCase() || "CNY";
  if (!CURRENCIES.has(currency)) throw new Error("暂不支持该币种");
  return currency;
}

function normalizeVisibility(value?: string) {
  const visibility = value?.trim().toUpperCase() || "ORGANIZATION";
  if (!VISIBILITIES.has(visibility)) throw new Error("可见范围不正确");
  return visibility;
}

function snapshotHash(input: {
  normalizedUrl: string | null;
  title?: string;
  description?: string;
  amount?: string | null;
  currency?: string | null;
  conditionText?: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function calculateSourcePriceChange(previousValue: string, currentValue: string) {
  const previousAmount = new Decimal(previousValue);
  const amount = new Decimal(currentValue);
  const deltaAmount = amount.minus(previousAmount);
  return {
    previousAmount: previousAmount.toFixed(4),
    amount: amount.toFixed(4),
    deltaAmount: deltaAmount.toFixed(4),
    deltaRate: previousAmount.isZero() ? null : deltaAmount.div(previousAmount).toFixed(6),
  };
}

async function assertVisibleVariant(itemId: string, storeId: string) {
  const item = await prisma.productIntelligenceItem.findFirst({
    where: {
      id: itemId,
      parentItemId: { not: null },
      OR: [
        { visibility: "PUBLIC", status: "ACTIVE" },
        { storeId, status: { not: "ARCHIVED" } },
      ],
    },
    select: { id: true },
  });
  if (!item) throw new Error("所选商品 SKU 不存在或无权访问");
}

async function createCapture(input: CaptureEvidenceInput) {
  const context = await requireUserContext();
  const normalizedUrl = normalizeCaptureUrl(input.sourceUrl);
  const platform = resolveCapturePlatform({
    normalizedUrl,
    platformHint: input.platformName,
    externalListingId: input.externalListingId,
    sourceText: input.sourceText,
  });
  const platformName = platform.platformName;
  const visibility = normalizeVisibility(input.visibility);
  const currency = input.amount
    ? normalizeCurrency(input.currency)
    : input.currency?.trim().toUpperCase() || null;
  const amount = input.amount ? positiveDecimal(input.amount, "金额") : null;
  if (!normalizedUrl && !input.sourceText?.trim() && !input.title?.trim() && !amount) {
    throw new Error("请至少提供链接、文字、商品名称或金额中的一项");
  }
  if (input.idempotencyKey) {
    const existing = await prisma.productIntelligenceCapture.findUnique({
      where: {
        organizationId_userId_idempotencyKey: {
          organizationId: context.organizationId,
          userId: context.userId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return { context, capture: existing, created: false };
  }
  const capture = await prisma.productIntelligenceCapture.create({
    data: {
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      idempotencyKey: input.idempotencyKey,
      captureType: input.captureType?.trim().toUpperCase() || "MANUAL",
      businessIntent: input.businessIntent,
      status: "RECEIVED",
      sourceUrl: input.sourceUrl?.trim() || null,
      normalizedUrl,
      sourceText: input.sourceText?.trim() || null,
      platformName,
      externalListingId: platform.externalListingId,
      title: input.title?.trim() || null,
      amount,
      currency,
      conditionText: input.conditionText?.trim() || null,
      visibility,
      rawPayload: input.rawPayload ?? Prisma.JsonNull,
      capturedAt: captureDate(input.capturedAt),
    },
  });
  if (input.assetIds?.length) {
    const uniqueAssetIds = [...new Set(input.assetIds.filter(Boolean))];
    const updated = await prisma.mobileAsset.updateMany({
      where: {
        id: { in: uniqueAssetIds },
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
        userId: context.userId,
        status: "READY",
        captureId: null,
        itemUnitId: null,
      },
      data: { captureId: capture.id },
    });
    if (updated.count !== uniqueAssetIds.length)
      throw new Error("部分证据文件不存在、未上传完成或无权使用");
  }
  if (platform.claims.length) {
    await prisma.extractedClaim.createMany({
      data: platform.claims.map((claim) => ({
        captureId: capture.id,
        fieldName: claim.fieldName,
        value: claim.value,
        evidenceText: claim.evidenceText || null,
        confidence: claim.confidence.toFixed(4),
        extractor: `PLATFORM_${platform.adapter}`,
        extractorVersion: platform.adapterVersion,
      })),
    });
  }
  const rawPayload = input.rawPayload;
  if (rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)) {
    const ocr = (rawPayload as Record<string, unknown>).ocr;
    const candidates =
      ocr && typeof ocr === "object" && !Array.isArray(ocr)
        ? (ocr as Record<string, unknown>).priceCandidates
        : null;
    if (Array.isArray(candidates)) {
      await prisma.extractedClaim.createMany({
        data: candidates.slice(0, 20).flatMap((candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
          const row = candidate as Record<string, unknown>;
          if (typeof row.value !== "string") return [];
          return [
            {
              captureId: capture.id,
              fieldName: "amount",
              value: row.value,
              evidenceText: typeof row.evidence === "string" ? row.evidence : null,
              extractor: "TESSERACT_OCR",
              extractorVersion: "7",
            },
          ];
        }),
      });
    }
  }
  return { context, capture, created: true };
}

export async function createCaptureDraft(input: CaptureEvidenceInput) {
  const { capture } = await createCapture(input);
  return { id: capture.id, status: capture.status };
}

async function ensureSourceAndSnapshot(
  capture: Awaited<ReturnType<typeof createCapture>>["capture"],
  input: CaptureEvidenceInput & { sellerName?: string; description?: string }
) {
  const sourceIdentity = [
    capture.externalListingId ? { externalListingId: capture.externalListingId } : null,
    capture.normalizedUrl ? { normalizedUrl: capture.normalizedUrl } : null,
  ].filter(Boolean) as Array<{ externalListingId: string } | { normalizedUrl: string }>;
  const existing = sourceIdentity.length
    ? await prisma.sourceListing.findFirst({
        where: {
          organizationId: capture.organizationId,
          storeId: capture.storeId,
          platformName: capture.platformName || "其他",
          OR: sourceIdentity,
        },
        orderBy: { createdAt: "asc" },
      })
    : null;
  const source = existing
    ? await prisma.sourceListing.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: capture.capturedAt,
          title: input.title?.trim() || existing.title,
          sellerName: input.sellerName?.trim() || existing.sellerName,
        },
      })
    : await prisma.sourceListing.create({
        data: {
          organizationId: capture.organizationId,
          storeId: capture.storeId,
          captureId: capture.id,
          platformName: capture.platformName || "其他",
          externalListingId: capture.externalListingId,
          sourceUrl: input.sourceUrl?.trim() || null,
          normalizedUrl: capture.normalizedUrl,
          sellerName: input.sellerName?.trim() || null,
          title: input.title?.trim() || null,
          firstSeenAt: capture.capturedAt,
          lastSeenAt: capture.capturedAt,
        },
      });
  const hash = snapshotHash({
    normalizedUrl: capture.normalizedUrl,
    title: input.title,
    description: input.description || input.sourceText,
    amount: capture.amount?.toString() ?? null,
    currency: capture.currency,
    conditionText: input.conditionText,
  });
  const previousSnapshot = await prisma.sourceListingSnapshot.findFirst({
    where: { sourceListingId: source.id, amount: { not: null }, currency: capture.currency },
    orderBy: { observedAt: "desc" },
  });
  const snapshot = await prisma.sourceListingSnapshot.upsert({
    where: { sourceListingId_contentHash: { sourceListingId: source.id, contentHash: hash } },
    create: {
      sourceListingId: source.id,
      captureId: capture.id,
      contentHash: hash,
      title: input.title?.trim() || null,
      description: (input.description || input.sourceText)?.trim() || null,
      amount: capture.amount,
      currency: capture.currency,
      conditionText: input.conditionText?.trim() || null,
      rawPayload: capture.rawPayload ?? Prisma.JsonNull,
      observedAt: capture.capturedAt,
    },
    update: {},
  });
  if (
    snapshot.captureId === capture.id &&
    previousSnapshot?.amount &&
    snapshot.amount &&
    !new Decimal(previousSnapshot.amount.toString()).eq(snapshot.amount.toString())
  ) {
    const change = calculateSourcePriceChange(
      previousSnapshot.amount.toString(),
      snapshot.amount.toString()
    );
    await prisma.sourcePriceChange.upsert({
      where: { snapshotId: snapshot.id },
      create: {
        sourceListingId: source.id,
        snapshotId: snapshot.id,
        captureId: capture.id,
        previousAmount: change.previousAmount,
        amount: change.amount,
        currency: snapshot.currency || capture.currency || "CNY",
        deltaAmount: change.deltaAmount,
        deltaRate: change.deltaRate,
        observedAt: snapshot.observedAt,
      },
      update: {},
    });
  }
  return { source, snapshot, snapshotExisted: snapshot.captureId !== capture.id };
}

export async function confirmPriceObservation(input: ConfirmObservationInput) {
  if (!input.amount) throw new Error("请填写看到的价格");
  const { context, capture, created } = await createCapture(input);
  if (
    !created &&
    (["IMPORTED", "DUPLICATE"].includes(capture.status) ||
      (capture.status === "NEEDS_REVIEW" && !input.itemId?.trim() && !input.skuId?.trim()))
  ) {
    const links = await prisma.captureBusinessLink.findMany({ where: { captureId: capture.id } });
    return {
      captureId: capture.id,
      sourceListingId: links.find((link) => link.refType === "SOURCE_LISTING")?.refId ?? null,
      snapshotId: null,
      observationId: links.find((link) => link.refType === "PRICE_OBSERVATION")?.refId ?? null,
      status: capture.status,
    };
  }
  const { source, snapshot, snapshotExisted } = await ensureSourceAndSnapshot(capture, input);
  let observationId: string | null = null;
  let observationExisted = false;
  let effectiveItemId = input.itemId?.trim() || null;
  if (input.skuId?.trim()) {
    const sku = await requireOperationalSku(context.activeStoreId, input.skuId.trim());
    const intelligenceItem = await ensureIntelligenceVariantForSku({
      storeId: context.activeStoreId,
      skuId: sku.id,
      userId: context.userId,
    });
    effectiveItemId = intelligenceItem.id;
    await saveSkuAlias({
      storeId: context.activeStoreId,
      skuId: sku.id,
      alias: input.title,
      userId: context.userId,
    });
  }
  if (effectiveItemId) {
    await assertVisibleVariant(effectiveItemId, context.activeStoreId);
    const existing = await prisma.productIntelligenceObservation.findFirst({
      where: {
        itemId: effectiveItemId,
        sourceSnapshotId: snapshot.id,
        sourceType: "MARKET_SEEN",
        priceType: "SALE",
        amount: capture.amount!,
        currency: capture.currency!,
      },
      select: { id: true },
    });
    const observation =
      existing ??
      (await prisma.productIntelligenceObservation.create({
        data: {
          itemId: effectiveItemId,
          storeId: context.activeStoreId,
          sourceType: "MARKET_SEEN",
          priceType: "SALE",
          amount: capture.amount!,
          currency: capture.currency!,
          sourceName: capture.platformName,
          platformName: capture.platformName,
          conditionGrade: capture.conditionText,
          confidence: "HIGH",
          visibility: capture.visibility,
          observedAt: capture.capturedAt,
          note: input.note?.trim() || null,
          createdById: context.userId,
          captureId: capture.id,
          sourceListingId: source.id,
          sourceSnapshotId: snapshot.id,
        },
      }));
    observationExisted = Boolean(existing);
    observationId = observation.id;
  } else {
    await persistCaptureSkuCandidates({
      captureId: capture.id,
      storeId: context.activeStoreId,
      hints: { query: input.title || input.sourceText, variant: input.conditionText },
    });
  }
  const status =
    observationExisted || (!observationId && snapshotExisted)
      ? "DUPLICATE"
      : observationId
        ? "IMPORTED"
        : "NEEDS_REVIEW";
  await prisma.productIntelligenceCapture.update({
    where: { id: capture.id },
    data: {
      status,
      importedAt: status === "IMPORTED" ? new Date() : null,
      duplicateOfId:
        status === "DUPLICATE" && snapshot.captureId !== capture.id ? snapshot.captureId : null,
    },
  });
  await prisma.captureBusinessLink.createMany({
    data: [
      { captureId: capture.id, refType: "SOURCE_LISTING", refId: source.id },
      ...(observationId
        ? [{ captureId: capture.id, refType: "PRICE_OBSERVATION", refId: observationId }]
        : []),
    ],
    skipDuplicates: true,
  });
  return {
    captureId: capture.id,
    sourceListingId: source.id,
    snapshotId: snapshot.id,
    observationId,
    skuId: input.skuId?.trim() || null,
    status,
  };
}

export async function confirmPurchaseCapture(input: ConfirmPurchaseInput) {
  if (!input.lines.length) throw new Error("至少需要一条采购商品");
  const currency = normalizeCurrency(input.currency);
  const purchasedAt = captureDate(input.purchasedAt || input.capturedAt);
  const checkedLines = input.lines.map((line) => ({
    ...line,
    productName: line.productName.trim(),
    quantity: positiveDecimal(line.quantity, `「${line.productName || "商品"}」数量`),
    unitPrice: positiveDecimal(line.unitPrice, `「${line.productName || "商品"}」单价`),
  }));
  if (checkedLines.some((line) => !line.productName)) throw new Error("商品名称不能为空");
  const validationContext = await requireUserContext();
  const resolvedLines = await Promise.all(
    checkedLines.map(async (line) => {
      let skuId = line.skuId?.trim() || null;
      const itemId = line.itemId?.trim() || null;
      if (!skuId && itemId) {
        const intelligenceItem = await prisma.productIntelligenceItem.findFirst({
          where: { id: itemId, storeId: validationContext.activeStoreId },
          select: { skuId: true },
        });
        skuId = intelligenceItem?.skuId || null;
      }
      if (skuId) await requireOperationalSku(validationContext.activeStoreId, skuId);
      if (!skuId && line.resolutionMode !== "CREATE_PENDING") {
        throw new Error(`请为「${line.productName}」选择正式 SKU，或明确选择创建待整理 SKU`);
      }
      return { ...line, itemId, skuId };
    })
  );
  const { context, capture } = await createCapture({
    ...input,
    amount: resolvedLines
      .reduce(
        (sum, line) => sum.plus(new Decimal(line.unitPrice).times(line.quantity)),
        new Decimal(0)
      )
      .toString(),
    currency,
  });
  const existingLinks = await prisma.captureBusinessLink.findMany({
    where: { captureId: capture.id },
  });
  if (capture.status === "IMPORTED" && existingLinks.length) {
    return { captureId: capture.id, status: capture.status, links: existingLinks };
  }
  for (const line of resolvedLines) {
    if (line.itemId) await assertVisibleVariant(line.itemId, context.activeStoreId);
  }
  const { source, snapshot } = await ensureSourceAndSnapshot(capture, {
    ...input,
    sellerName: input.supplierName,
    title: input.title || resolvedLines.map((line) => line.productName).join(" / "),
  });
  const draft = await prisma.capturePurchaseDraft.upsert({
    where: { captureId: capture.id },
    create: {
      captureId: capture.id,
      supplierName: input.supplierName?.trim() || null,
      platformName: capture.platformName,
      externalOrderNo: input.externalOrderNo?.trim() || null,
      currency,
      shippingFee: optionalNonNegativeDecimal(input.shippingFee, "运费"),
      purchasedAt,
      status: "READY",
      note: input.note?.trim() || null,
      lines: {
        create: resolvedLines.map((line) => ({
          itemId: line.itemId?.trim() || null,
          skuId: line.skuId,
          productName: line.productName,
          variant: line.variant?.trim() || null,
          conditionType: line.conditionType?.trim() || null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          note: line.note?.trim() || null,
        })),
      },
    },
    update: {},
    include: { lines: { orderBy: { createdAt: "asc" } } },
  });

  const rows: QuickEntryRowInput[] = resolvedLines.map((line) => ({
    storeId: context.activeStoreId,
    existingSkuId: line.skuId || undefined,
    sourceType: "MOBILE_CAPTURE",
    rawBrand: line.brand,
    rawProductName: line.productName,
    rawVariant: line.variant,
    rawCategory: line.category,
    conditionType: line.conditionType || "新品",
    quantity: line.quantity,
    purchasePrice: line.unitPrice,
    purchaseCurrency: currency,
    purchasePlatformText: input.supplierName?.trim() || capture.platformName || "手机购入",
    purchaseDate: purchasedAt.toISOString(),
    purchaseTrackingNo: input.trackingNo,
    purchaseShippingFee: input.shippingFee,
    currentLocationText: input.currentLocationText,
    note: [input.externalOrderNo ? `外部订单号：${input.externalOrderNo}` : "", input.note || ""]
      .filter(Boolean)
      .join("；"),
    batchNote: input.externalOrderNo?.trim() || input.note?.trim(),
  }));
  const processed =
    rows.length > 1
      ? await createGroupedPurchaseQuickEntries(rows)
      : await createAndProcessQuickEntry(rows[0]);
  const entryIds = "entryIds" in processed ? processed.entryIds : [processed.entryId];
  const purchaseOrderId = "purchaseOrderId" in processed ? processed.purchaseOrderId : null;
  const finalSkuIds =
    "skuIds" in processed ? processed.skuIds : "skuId" in processed ? [processed.skuId] : [];
  const observationIds: string[] = [];
  for (const [index, line] of resolvedLines.entries()) {
    const skuId = finalSkuIds[index];
    if (!skuId) throw new Error(`「${line.productName}」未生成正式 SKU`);
    const intelligenceItem = line.itemId
      ? await prisma.productIntelligenceItem.findUniqueOrThrow({ where: { id: line.itemId } })
      : await ensureIntelligenceVariantForSku({
          storeId: context.activeStoreId,
          skuId,
          userId: context.userId,
        });
    if (draft.lines[index]) {
      await prisma.capturePurchaseLine.update({
        where: { id: draft.lines[index].id },
        data: { skuId, itemId: intelligenceItem.id },
      });
    }
    await saveSkuAlias({
      storeId: context.activeStoreId,
      skuId,
      alias: [line.productName, line.variant].filter(Boolean).join(" "),
      userId: context.userId,
    });
    await prisma.matchCandidate.upsert({
      where: {
        captureId_skuId_matcher_matcherVersion: {
          captureId: capture.id,
          skuId,
          matcher: SKU_MATCHER,
          matcherVersion: SKU_MATCHER_VERSION,
        },
      },
      create: {
        captureId: capture.id,
        skuId,
        score: line.skuId ? "1" : "0.5",
        reasons: line.skuId ? ["用户明确选择"] : ["用户明确创建待整理 SKU"],
        matcher: SKU_MATCHER,
        matcherVersion: SKU_MATCHER_VERSION,
        decision: "ACCEPTED",
        decidedAt: new Date(),
      },
      update: { decision: "ACCEPTED", decidedAt: new Date() },
    });
    const observation = await prisma.productIntelligenceObservation.create({
      data: {
        itemId: intelligenceItem.id,
        storeId: context.activeStoreId,
        sourceType: "REAL_PURCHASE",
        priceType: "PURCHASE",
        amount: line.unitPrice,
        currency,
        quantity: line.quantity,
        sourceName: input.supplierName?.trim() || capture.platformName,
        platformName: capture.platformName,
        conditionGrade: line.conditionType?.trim() || null,
        confidence: "HIGH",
        visibility: capture.visibility,
        observedAt: purchasedAt,
        note: input.note?.trim() || null,
        createdById: context.userId,
        captureId: capture.id,
        sourceListingId: source.id,
        sourceSnapshotId: snapshot.id,
      },
    });
    observationIds.push(observation.id);
  }
  const links = [
    { captureId: capture.id, refType: "SOURCE_LISTING", refId: source.id },
    ...entryIds.map((refId) => ({ captureId: capture.id, refType: "QUICK_ENTRY", refId })),
    ...(purchaseOrderId
      ? [{ captureId: capture.id, refType: "PURCHASE_ORDER", refId: purchaseOrderId }]
      : []),
    ...finalSkuIds.map((refId) => ({ captureId: capture.id, refType: "SKU", refId })),
    ...observationIds.map((refId) => ({
      captureId: capture.id,
      refType: "PRICE_OBSERVATION",
      refId,
    })),
  ];
  await prisma.$transaction([
    prisma.captureBusinessLink.createMany({ data: links, skipDuplicates: true }),
    prisma.capturePurchaseDraft.update({
      where: { captureId: capture.id },
      data: { status: "IMPORTED" },
    }),
    prisma.productIntelligenceCapture.update({
      where: { id: capture.id },
      data: { status: "IMPORTED", importedAt: new Date() },
    }),
  ]);
  return {
    captureId: capture.id,
    status: "IMPORTED",
    entryIds,
    purchaseOrderId,
    observationIds,
    links,
  };
}

export async function getCaptureItemOptions() {
  const context = await requireUserContext();
  return prisma.productIntelligenceItem.findMany({
    where: {
      parentItemId: { not: null },
      OR: [
        { visibility: "PUBLIC", status: "ACTIVE" },
        { storeId: context.activeStoreId, status: { not: "ARCHIVED" } },
      ],
    },
    select: { id: true, title: true, brand: true, parentItem: { select: { title: true } } },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
}

export async function getMyRecentCaptures(limit = 30) {
  const context = await requireUserContext();
  return prisma.productIntelligenceCapture.findMany({
    where: {
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
    },
    include: { businessLinks: true, purchaseDraft: { include: { lines: true } } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
}

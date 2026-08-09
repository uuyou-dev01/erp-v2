"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { confirmPriceObservation, confirmPurchaseCapture } from "@/lib/capture/service";
import { importRemoteCaptureImages } from "@/lib/capture/image-import";
import { mapWithConcurrency } from "@/lib/capture/web-link-batch";
import {
  persistCaptureSkuCandidates,
  SKU_MATCHER,
  SKU_MATCHER_VERSION,
} from "@/lib/capture/sku-matching";
import { matchOrCreateQuickEntrySku } from "@/lib/application/quick-entry";
import type { WebLinkPreview } from "@/lib/capture/web-link-parser";
import { assertPublicWebUrl, readWebProductLink } from "@/lib/capture/web-link-reader";
import { resolveCapturePlatform } from "@/lib/capture/platform-adapters";

export interface SaveWebLinkCaptureInput {
  idempotencyKey: string;
  preview: WebLinkPreview;
  title: string;
  amount: string;
  currency: string;
  conditionText: string;
  selectedImageUrls: string[];
  skuId?: string;
}

export async function saveWebLinkCaptureAction(input: SaveWebLinkCaptureInput) {
  try {
    if (!input.title.trim()) throw new Error("请确认商品名称");
    if (!input.amount.trim()) throw new Error("请确认本次看到的价格");
    const preview = input.preview;
    const safeSourceUrl = (await assertPublicWebUrl(preview.sourceUrl)).toString();
    const resolvedPlatform = resolveCapturePlatform({ normalizedUrl: safeSourceUrl });
    const result = await confirmPriceObservation({
      captureType: "SHARE_URL",
      businessIntent: "OBSERVE_PRICE",
      idempotencyKey: input.idempotencyKey,
      sourceUrl: safeSourceUrl,
      sourceText: preview.description,
      platformName: resolvedPlatform.platformName,
      externalListingId: resolvedPlatform.externalListingId ?? undefined,
      title: input.title.trim(),
      amount: input.amount.trim(),
      currency: input.currency,
      conditionText: input.conditionText.trim() || undefined,
      visibility: "ORGANIZATION",
      skuId: input.skuId?.trim() || undefined,
      note: [
        preview.sellerName ? `来源店铺：${preview.sellerName}` : "",
        preview.sourceCategoryPath.length
          ? `来源类目：${preview.sourceCategoryPath.join(" / ")}`
          : "",
        preview.pageStatus !== "UNKNOWN" ? `页面状态：${preview.pageStatus}` : "",
      ]
        .filter(Boolean)
        .join("；"),
      rawPayload: {
        origin: "ERP_WEB_LINK_PREVIEW",
        extractorVersion: "2",
        extractionMethod: preview.extractionMethod,
        adapterCode: preview.adapterCode,
        adapterVersion: preview.adapterVersion,
        extractionClaims: preview.extractionClaims.map((claim) => ({
          fieldName: claim.fieldName,
          source: claim.source,
          confidence: claim.confidence,
          evidenceText: claim.evidenceText || null,
        })),
        normalizedUrl: preview.normalizedUrl,
        pageStatus: preview.pageStatus,
        sellerName: preview.sellerName,
        brand: preview.brand,
        sourceCategoryPath: preview.sourceCategoryPath,
        suggestedInternalCategory: preview.suggestedInternalCategory,
        description: preview.description,
        imageUrls: input.selectedImageUrls
          .filter((url) => preview.imageUrls.includes(url))
          .slice(0, 12),
        warnings: preview.warnings,
      },
    });
    const selectedImageUrls = input.selectedImageUrls
      .filter((url) => preview.imageUrls.includes(url))
      .slice(0, 12);
    const context = await requireUserContext();
    const imageImport = await importRemoteCaptureImages({
      organizationId: context.organizationId,
      storeId: context.activeStoreId,
      userId: context.userId,
      captureId: result.captureId,
      sourcePageUrl: safeSourceUrl,
      imageUrls: selectedImageUrls,
    });
    revalidatePath("/product-intelligence/captures");
    revalidatePath(`/product-intelligence/captures/${result.captureId}`);
    revalidatePath("/product-intelligence");
    return actionSuccess({
      ...result,
      imageImportCount: imageImport.assetIds.length,
      imageImportFailures: imageImport.failures,
      reviewUrl: `/product-intelligence/captures/${result.captureId}`,
    });
  } catch (error) {
    return toActionFailure(error, "链接采集保存失败，请重试");
  }
}

export async function saveWebLinkCaptureBatchAction(inputs: SaveWebLinkCaptureInput[]) {
  try {
    if (!inputs.length) throw new Error("请至少选择一个商品");
    if (inputs.length > 12) throw new Error("一次最多保存 12 个商品");
    const items = await mapWithConcurrency(inputs, 3, async (input) => {
      const result = await saveWebLinkCaptureAction(input);
      return result.success
        ? {
            idempotencyKey: input.idempotencyKey,
            success: true as const,
            captureId: result.captureId,
            reviewUrl: result.reviewUrl,
            status: result.status,
            imageImportCount: result.imageImportCount,
            imageImportFailures: result.imageImportFailures,
          }
        : {
            idempotencyKey: input.idempotencyKey,
            success: false as const,
            error: result.error,
          };
    });
    return actionSuccess({ items });
  } catch (error) {
    return toActionFailure(error, "批量保存失败，请重试");
  }
}

function capturePayload(capture: { rawPayload: unknown }) {
  return capture.rawPayload &&
    typeof capture.rawPayload === "object" &&
    !Array.isArray(capture.rawPayload)
    ? (capture.rawPayload as Record<string, unknown>)
    : {};
}

function payloadText(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? payload[key].trim() : "";
}

function payloadImageUrls(payload: Record<string, unknown>) {
  return Array.isArray(payload.imageUrls)
    ? payload.imageUrls
        .filter(
          (value): value is string => typeof value === "string" && /^https?:\/\//i.test(value)
        )
        .slice(0, 12)
    : [];
}

export async function createPendingSkuForCaptureAction(captureId: string) {
  try {
    const context = await requireUserContext();
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: {
        id: captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
      },
      include: { assets: { where: { status: "READY" }, orderBy: { createdAt: "asc" } } },
    });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    if (capture.businessIntent !== "OBSERVE_PRICE")
      throw new Error("只有价格采集可以从这里创建待整理 SKU");
    if (capture.status === "IMPORTED") throw new Error("该采集已经完成处理");
    if (!capture.title?.trim()) throw new Error("该采集缺少商品名称");
    if (!capture.amount || !capture.currency) throw new Error("该采集缺少金额或币种");
    const reviewKey = capture.idempotencyKey || `review:${capture.id}`;
    if (!capture.idempotencyKey) {
      await prisma.productIntelligenceCapture.update({
        where: { id: capture.id },
        data: { idempotencyKey: reviewKey },
      });
    }

    const payload = capturePayload(capture);
    let assets = capture.assets;
    let sourceImageUrls = payloadImageUrls(payload);
    let imageWarning: string | null = null;
    if (!assets.length) {
      if (!sourceImageUrls.length && capture.sourceUrl) {
        try {
          sourceImageUrls = (await readWebProductLink(capture.sourceUrl)).imageUrls;
        } catch (error) {
          imageWarning = error instanceof Error ? error.message : "无法重新读取来源图片";
        }
      }
      if (sourceImageUrls.length) {
        const imageImport = await importRemoteCaptureImages({
          organizationId: context.organizationId,
          storeId: context.activeStoreId,
          userId: context.userId,
          captureId: capture.id,
          sourcePageUrl: capture.sourceUrl,
          imageUrls: sourceImageUrls,
        });
        if (imageImport.failures.length) {
          imageWarning = `${imageImport.failures.length} 张来源图片未能保存`;
        }
        assets = await prisma.mobileAsset.findMany({
          where: { captureId: capture.id, status: "READY" },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    const skuResult = await prisma.$transaction((tx) =>
      matchOrCreateQuickEntrySku(tx, context.activeStoreId, {
        storeId: context.activeStoreId,
        sourceType: "CAPTURE_REVIEW",
        rawProductName: capture.title!.trim(),
        rawBrand: payloadText(payload, "brand") || undefined,
        rawCategory: payloadText(payload, "suggestedInternalCategory") || undefined,
      })
    );
    const persistedCoverImage = assets.find((asset) => asset.publicUrl)?.publicUrl || null;
    const coverImage = persistedCoverImage || sourceImageUrls[0] || null;
    const relatedSkuIds = [skuResult.sku.id, skuResult.sku.parentSkuId].filter(
      (id): id is string => Boolean(id)
    );
    if (coverImage) {
      await prisma.sKU.updateMany({
        where: { id: { in: relatedSkuIds }, imageUrl: null },
        data: { imageUrl: coverImage },
      });
      if (!persistedCoverImage && sourceImageUrls.length) {
        imageWarning = "来源图片已作为商品封面使用，但尚未完成本地转存";
      }
    }

    const result = await confirmPriceObservation({
      businessIntent: "OBSERVE_PRICE",
      idempotencyKey: reviewKey,
      captureType: capture.captureType,
      sourceUrl: capture.sourceUrl ?? undefined,
      sourceText: capture.sourceText ?? undefined,
      platformName: capture.platformName ?? undefined,
      externalListingId: capture.externalListingId ?? undefined,
      title: capture.title,
      amount: capture.amount.toString(),
      currency: capture.currency,
      conditionText: capture.conditionText ?? undefined,
      visibility: capture.visibility,
      capturedAt: capture.capturedAt.toISOString(),
      skuId: skuResult.sku.id,
      note: "从采集箱明确创建待整理 SKU",
    });
    if (coverImage) {
      await prisma.productIntelligenceItem.updateMany({
        where: { skuId: { in: relatedSkuIds }, imageUrl: null },
        data: { imageUrl: coverImage },
      });
    }
    await prisma.matchCandidate.updateMany({
      where: { captureId, matcher: SKU_MATCHER, matcherVersion: SKU_MATCHER_VERSION },
      data: { decision: "REJECTED", decidedAt: new Date() },
    });
    await prisma.matchCandidate.upsert({
      where: {
        captureId_skuId_matcher_matcherVersion: {
          captureId,
          skuId: skuResult.sku.id,
          matcher: SKU_MATCHER,
          matcherVersion: SKU_MATCHER_VERSION,
        },
      },
      create: {
        captureId,
        skuId: skuResult.sku.id,
        score: skuResult.created ? "0.5" : "1",
        reasons: [skuResult.created ? "用户明确创建待整理 SKU" : "用户明确选择同名 SKU"],
        matcher: SKU_MATCHER,
        matcherVersion: SKU_MATCHER_VERSION,
        decision: "ACCEPTED",
        decidedAt: new Date(),
      },
      update: { decision: "ACCEPTED", decidedAt: new Date() },
    });
    await prisma.captureBusinessLink.createMany({
      data: [{ captureId, refType: "SKU", refId: skuResult.sku.id }],
      skipDuplicates: true,
    });
    revalidatePath("/product-intelligence/captures");
    revalidatePath(`/product-intelligence/captures/${captureId}`);
    revalidatePath("/product-intelligence");
    revalidatePath("/inventory/skus");
    revalidatePath(`/inventory/skus/${skuResult.sku.id}`);
    return actionSuccess({
      ...result,
      skuId: skuResult.sku.id,
      skuCode: skuResult.sku.code,
      skuName: skuResult.sku.name,
      created: skuResult.created,
      imageCount: assets.length,
      imageWarning,
    });
  } catch (error) {
    return toActionFailure(error, "创建待整理 SKU 失败，请重试");
  }
}

export interface CreatePurchaseFromCaptureInput {
  captureId: string;
  skuId?: string;
  createPendingSku?: boolean;
  quantity: string;
  unitPrice: string;
  purchasedAt: string;
  shippingFee?: string;
}

export async function createPurchaseFromCaptureAction(input: CreatePurchaseFromCaptureInput) {
  try {
    const context = await requireUserContext();
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: {
        id: input.captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
      },
    });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    if (!capture.title?.trim()) throw new Error("该采集缺少商品名称");
    if (!capture.amount || !capture.currency) throw new Error("该采集缺少金额或币种");
    if (!input.skuId?.trim() && !input.createPendingSku) {
      throw new Error("请选择商品主档，或明确创建待完善商品");
    }
    const payload = capturePayload(capture);
    const purchase = await confirmPurchaseCapture({
      captureType: capture.captureType,
      businessIntent: "RECORD_PURCHASE",
      idempotencyKey: `capture-purchase:${capture.id}`,
      sourceUrl: capture.sourceUrl ?? undefined,
      sourceText: capture.sourceText ?? undefined,
      platformName: capture.platformName ?? undefined,
      externalListingId: capture.externalListingId ?? undefined,
      title: capture.title,
      currency: capture.currency,
      conditionText: capture.conditionText ?? undefined,
      visibility: capture.visibility,
      supplierName: payloadText(payload, "sellerName") || capture.platformName || undefined,
      purchasedAt: input.purchasedAt,
      shippingFee: input.shippingFee,
      lines: [
        {
          skuId: input.skuId?.trim() || undefined,
          resolutionMode: input.skuId?.trim() ? "EXISTING" : "CREATE_PENDING",
          brand: payloadText(payload, "brand") || undefined,
          productName: capture.title.trim(),
          category: payloadText(payload, "suggestedInternalCategory") || undefined,
          conditionType: capture.conditionText ?? undefined,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
        },
      ],
      rawPayload: {
        origin: "CAPTURE_REVIEW_PURCHASE",
        sourceCaptureId: capture.id,
        sourceAdapterCode: payloadText(payload, "adapterCode") || null,
      },
    });
    const skuLink = purchase.links.find((link) => link.refType === "SKU");
    if (!skuLink) throw new Error("采购已经生成，但未找到对应商品主档");

    if (!capture.idempotencyKey) {
      await prisma.productIntelligenceCapture.update({
        where: { id: capture.id },
        data: { idempotencyKey: `review:${capture.id}` },
      });
    }
    if (capture.status !== "IMPORTED") {
      await confirmPriceObservation({
        captureType: capture.captureType,
        businessIntent: "OBSERVE_PRICE",
        idempotencyKey: capture.idempotencyKey || `review:${capture.id}`,
        sourceUrl: capture.sourceUrl ?? undefined,
        sourceText: capture.sourceText ?? undefined,
        platformName: capture.platformName ?? undefined,
        externalListingId: capture.externalListingId ?? undefined,
        title: capture.title,
        amount: capture.amount.toString(),
        currency: capture.currency,
        conditionText: capture.conditionText ?? undefined,
        visibility: capture.visibility,
        capturedAt: capture.capturedAt.toISOString(),
        skuId: skuLink.refId,
        note: "由商品情报登记采购并同时确认市场价格",
      });
    }
    await prisma.captureBusinessLink.createMany({
      data: [
        { captureId: capture.id, refType: "PURCHASE_CAPTURE", refId: purchase.captureId },
        ...purchase.links
          .filter((link) => ["PURCHASE_ORDER", "QUICK_ENTRY", "SKU"].includes(link.refType))
          .map((link) => ({ captureId: capture.id, refType: link.refType, refId: link.refId })),
      ],
      skipDuplicates: true,
    });
    revalidatePath("/product-intelligence/captures");
    revalidatePath(`/product-intelligence/captures/${capture.id}`);
    revalidatePath("/product-intelligence");
    revalidatePath("/procurement");
    revalidatePath("/workbench");
    return actionSuccess({
      captureId: capture.id,
      purchaseCaptureId: purchase.captureId,
      purchaseOrderId: purchase.purchaseOrderId,
      skuId: skuLink.refId,
    });
  } catch (error) {
    return toActionFailure(error, "从商品情报登记采购失败，请重试");
  }
}

export async function confirmCaptureObservationAction(captureId: string, skuId: string) {
  try {
    const context = await requireUserContext();
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: {
        id: captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
      },
    });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    if (!capture.amount || !capture.currency) throw new Error("该采集缺少金额或币种");
    const reviewKey = capture.idempotencyKey || `review:${capture.id}`;
    if (!capture.idempotencyKey) {
      await prisma.productIntelligenceCapture.update({
        where: { id: capture.id },
        data: { idempotencyKey: reviewKey },
      });
    }
    const result = await confirmPriceObservation({
      businessIntent: "OBSERVE_PRICE",
      idempotencyKey: reviewKey,
      captureType: capture.captureType,
      sourceUrl: capture.sourceUrl ?? undefined,
      sourceText: capture.sourceText ?? undefined,
      platformName: capture.platformName ?? undefined,
      externalListingId: capture.externalListingId ?? undefined,
      title: capture.title ?? undefined,
      amount: capture.amount.toString(),
      currency: capture.currency,
      conditionText: capture.conditionText ?? undefined,
      visibility: capture.visibility,
      capturedAt: capture.capturedAt.toISOString(),
      skuId,
    });
    await prisma.matchCandidate.updateMany({
      where: { captureId, matcher: SKU_MATCHER, matcherVersion: SKU_MATCHER_VERSION },
      data: { decision: "REJECTED", decidedAt: new Date() },
    });
    await prisma.matchCandidate.upsert({
      where: {
        captureId_skuId_matcher_matcherVersion: {
          captureId,
          skuId,
          matcher: SKU_MATCHER,
          matcherVersion: SKU_MATCHER_VERSION,
        },
      },
      create: {
        captureId,
        skuId,
        score: "1",
        reasons: ["人工确认"],
        matcher: SKU_MATCHER,
        matcherVersion: SKU_MATCHER_VERSION,
        decision: "ACCEPTED",
        decidedAt: new Date(),
      },
      update: { decision: "ACCEPTED", decidedAt: new Date() },
    });
    revalidatePath("/product-intelligence/captures");
    revalidatePath(`/product-intelligence/captures/${captureId}`);
    revalidatePath("/product-intelligence");
    return actionSuccess(result);
  } catch (error) {
    return toActionFailure(error, "确认采集失败，请重试");
  }
}

export async function refreshCaptureSkuCandidatesAction(captureId: string) {
  try {
    const context = await requireUserContext();
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: {
        id: captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
      },
    });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    const candidates = await persistCaptureSkuCandidates({
      captureId,
      storeId: context.activeStoreId,
      hints: {
        query: capture.title || capture.sourceText || undefined,
        variant: capture.conditionText || undefined,
      },
    });
    revalidatePath(`/product-intelligence/captures/${captureId}`);
    return actionSuccess({ count: candidates.length });
  } catch (error) {
    return toActionFailure(error, "重新匹配失败，请重试");
  }
}

export async function rejectCaptureSkuCandidateAction(captureId: string, skuId: string) {
  try {
    const context = await requireUserContext();
    const capture = await prisma.productIntelligenceCapture.findFirst({
      where: {
        id: captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
      },
      select: { id: true },
    });
    if (!capture) throw new Error("采集记录不存在或无权访问");
    const result = await prisma.matchCandidate.updateMany({
      where: { captureId, skuId, matcher: SKU_MATCHER, matcherVersion: SKU_MATCHER_VERSION },
      data: { decision: "REJECTED", decidedAt: new Date() },
    });
    if (!result.count) throw new Error("匹配候选不存在");
    revalidatePath(`/product-intelligence/captures/${captureId}`);
    return actionSuccess({ captureId, skuId });
  } catch (error) {
    return toActionFailure(error, "拒绝候选失败，请重试");
  }
}

export async function dismissCaptureAction(captureId: string) {
  try {
    const context = await requireUserContext();
    const result = await prisma.productIntelligenceCapture.updateMany({
      where: {
        id: captureId,
        organizationId: context.organizationId,
        storeId: context.activeStoreId,
        status: { not: "IMPORTED" },
      },
      data: { status: "DISMISSED", dismissedAt: new Date() },
    });
    if (!result.count) throw new Error("记录不存在、已经导入或无权访问");
    revalidatePath("/product-intelligence/captures");
    return actionSuccess({ captureId });
  } catch (error) {
    return toActionFailure(error, "忽略采集失败，请重试");
  }
}

import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CaptureReviewActions } from "@/components/product-intelligence/capture-review-actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  RECEIVED: "已接收",
  PROCESSING: "识别中",
  NEEDS_REVIEW: "待整理",
  READY: "可导入",
  IMPORTED: "已处理",
  PARTIAL: "部分完成",
  DUPLICATE: "重复",
  FAILED: "失败",
  DISMISSED: "已忽略",
};

const intentLabel: Record<string, string> = {
  OBSERVE_PRICE: "记录市场价格",
  RECORD_PURCHASE: "登记购入",
  UNDECIDED: "待确认",
};

export default async function CaptureReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, context] = await Promise.all([params, requireUserContext()]);
  const capture = await prisma.productIntelligenceCapture.findFirst({
    where: { id, organizationId: context.organizationId, storeId: context.activeStoreId },
    include: {
      assets: true,
      sourceListings: { include: { snapshots: { orderBy: { observedAt: "desc" } } } },
      priceChanges: { orderBy: { observedAt: "desc" } },
      purchaseDraft: { include: { lines: { include: { sku: true } } } },
      businessLinks: true,
      matchCandidates: {
        include: { sku: { include: { parentSku: true } } },
        orderBy: { score: "desc" },
      },
    },
  });
  if (!capture) notFound();
  const candidates = capture.matchCandidates.flatMap((candidate) =>
    candidate.sku
      ? [
          {
            skuId: candidate.sku.id,
            code: candidate.sku.code,
            name: candidate.sku.name,
            parentName: candidate.sku.parentSku?.name ?? null,
            variantLabel: candidate.sku.variantLabel,
            brand: candidate.sku.brand,
            imageUrl: candidate.sku.imageUrl,
            barcode: null,
            manufacturerCode: candidate.sku.manufacturerCode,
            score: Number(candidate.score),
            reasons: Array.isArray(candidate.reasons)
              ? candidate.reasons.filter((reason): reason is string => typeof reason === "string")
              : [],
            decision: candidate.decision,
          },
        ]
      : []
  );
  const payload =
    capture.rawPayload &&
    typeof capture.rawPayload === "object" &&
    !Array.isArray(capture.rawPayload)
      ? (capture.rawPayload as Record<string, unknown>)
      : {};
  const selectedSourceImageCount = Array.isArray(payload.imageUrls)
    ? payload.imageUrls.filter((value) => typeof value === "string").length
    : 0;
  return (
    <div className="space-y-6">
      <header>
        <Link href="/product-intelligence/captures" className="text-sm text-muted-foreground">
          ← 返回采集箱
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {capture.title || "未命名采集"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {capture.platformName || "未知来源"} · {statusLabel[capture.status] || capture.status} ·{" "}
          {capture.capturedAt.toLocaleString("zh-CN")}
        </p>
      </header>
      {capture.priceChanges.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">本次检测到价格变化</CardTitle>
          </CardHeader>
          <CardContent>
            {capture.priceChanges.map((change) => {
              const up = Number(change.deltaAmount) > 0;
              return (
                <div key={change.id} className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    {change.currency} {change.previousAmount.toString()} →{" "}
                    <span className="font-semibold text-foreground">
                      {change.amount.toString()}
                    </span>
                  </p>
                  <span
                    className={`flex items-center gap-1 text-sm font-semibold ${up ? "text-rose-600" : "text-emerald-600"}`}
                  >
                    {up ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                    {change.deltaAmount.toString()} ·{" "}
                    {change.deltaRate ? `${(Number(change.deltaRate) * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>原始证据</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[100px_1fr] gap-y-3 text-sm">
              <dt className="text-muted-foreground">业务意图</dt>
              <dd>{intentLabel[capture.businessIntent] || capture.businessIntent}</dd>
              <dt className="text-muted-foreground">金额</dt>
              <dd>
                {capture.amount ? `${capture.currency} ${capture.amount.toString()}` : "未识别"}
              </dd>
              <dt className="text-muted-foreground">成色</dt>
              <dd>{capture.conditionText || "未标注"}</dd>
              <dt className="text-muted-foreground">原始文字</dt>
              <dd className="whitespace-pre-wrap">{capture.sourceText || "无"}</dd>
              <dt className="text-muted-foreground">来源链接</dt>
              <dd>
                {capture.sourceUrl ? (
                  <a
                    href={capture.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600"
                  >
                    打开来源 <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  "无"
                )}
              </dd>
            </dl>
            {capture.purchaseDraft?.lines.length ? (
              <div className="divide-y rounded-xl border">
                {capture.purchaseDraft.lines.map((line) => (
                  <div key={line.id} className="px-3 py-3 text-sm">
                    <p className="font-medium">
                      {line.productName}
                      {line.variant ? ` · ${line.variant}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {line.sku ? `${line.sku.code} · ${line.sku.name}` : "未关联正式 SKU"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
            {capture.assets.length ? (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  已保存到系统的图片（{capture.assets.length}）
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {capture.assets.map((asset) =>
                    asset.publicUrl ? (
                      <div
                        key={asset.id}
                        className="relative aspect-square overflow-hidden rounded-lg border"
                      >
                        <Image
                          src={asset.publicUrl}
                          alt="采集证据"
                          fill
                          sizes="220px"
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            ) : null}
            {selectedSourceImageCount > capture.assets.length ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                已选择 {selectedSourceImageCount} 张来源图片，其中 {capture.assets.length}{" "}
                张已保存到系统；其余图片可在重新处理新商品时再次尝试采集。
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>人工确认</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              先搜索正式 ERP SKU；如果确认是新商品，可以创建待整理
              SKU。只有人工确认后才写入价格时间线。
            </p>
            <CaptureReviewActions
              captureId={capture.id}
              title={capture.title || capture.sourceText || ""}
              candidates={candidates}
              amount={capture.amount?.toString() || ""}
              currency={capture.currency || "CNY"}
              canConfirm={
                capture.businessIntent === "OBSERVE_PRICE" && capture.status !== "IMPORTED"
              }
              canPurchase={Boolean(
                capture.businessIntent === "OBSERVE_PRICE" &&
                capture.title &&
                capture.amount &&
                capture.currency &&
                capture.status !== "DISMISSED"
              )}
              hasPurchase={capture.businessLinks.some((link) =>
                ["PURCHASE_CAPTURE", "PURCHASE_ORDER"].includes(link.refType)
              )}
            />
            {capture.businessLinks.length ? (
              <div className="mt-6 border-t pt-4">
                <p className="text-xs font-medium text-muted-foreground">已关联业务对象</p>
                {capture.businessLinks.map((link) =>
                  link.refType === "SKU" ? (
                    <Link
                      key={link.id}
                      href={`/inventory/skus/${link.refId}`}
                      className="mt-2 block text-xs font-medium text-blue-600"
                    >
                      打开已关联 SKU
                    </Link>
                  ) : link.refType === "PURCHASE_ORDER" ? (
                    <Link
                      key={link.id}
                      href={`/procurement/${link.refId}`}
                      className="mt-2 block text-xs font-medium text-blue-600"
                    >
                      打开采购单
                    </Link>
                  ) : link.refType === "PURCHASE_CAPTURE" ? (
                    <Link
                      key={link.id}
                      href={`/product-intelligence/captures/${link.refId}`}
                      className="mt-2 block text-xs font-medium text-blue-600"
                    >
                      打开采购采集记录
                    </Link>
                  ) : (
                    <p key={link.id} className="mt-2 font-mono text-xs">
                      {link.refType}: {link.refId}
                    </p>
                  )
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

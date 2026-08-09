"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PackagePlus, RefreshCw, ShoppingBag, X } from "lucide-react";
import {
  confirmCaptureObservationAction,
  createPurchaseFromCaptureAction,
  createPendingSkuForCaptureAction,
  dismissCaptureAction,
  refreshCaptureSkuCandidatesAction,
  rejectCaptureSkuCandidateAction,
} from "@/app/actions/captures";
import { Button } from "@/components/ui/button";
import { MobileSkuMatcher, type MobileSkuCandidate } from "@/components/mobile/mobile-sku-matcher";

export function CaptureReviewActions({
  captureId,
  title,
  candidates,
  canConfirm,
  amount,
  currency,
  canPurchase,
  hasPurchase,
}: {
  captureId: string;
  title: string;
  candidates: Array<MobileSkuCandidate & { decision: string | null }>;
  canConfirm: boolean;
  amount: string;
  currency: string;
  canPurchase: boolean;
  hasPurchase: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<MobileSkuCandidate | null>(
    candidates.find((candidate) => candidate.decision === "ACCEPTED") ?? null
  );
  const [pendingCreation, setPendingCreation] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState(amount);
  const [shippingFee, setShippingFee] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const activeCandidates = candidates.filter((candidate) => candidate.decision !== "REJECTED");

  const createPendingSku = () =>
    startTransition(async () => {
      const result = await createPendingSkuForCaptureAction(captureId);
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setPendingCreation(false);
      setSelected({
        skuId: result.skuId,
        code: result.skuCode,
        name: result.skuName,
        parentName: null,
        variantLabel: null,
        brand: null,
        imageUrl: null,
        barcode: null,
        manufacturerCode: null,
        score: result.created ? 0.5 : 1,
        reasons: [result.created ? "已创建待整理 SKU" : "已关联同名 SKU"],
      });
      setMessage(
        `${result.created ? "已创建待整理 SKU" : "已关联同名 SKU"}，写入价格时间线${result.imageCount ? `，并保存 ${result.imageCount} 张图片` : ""}${result.imageWarning ? `；图片提示：${result.imageWarning}` : ""}`
      );
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {activeCandidates.length ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">系统候选</p>
          {activeCandidates.slice(0, 5).map((candidate) => (
            <div
              key={candidate.skuId}
              className="flex items-start gap-3 rounded-xl border px-3 py-3"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setSelected(candidate);
                  setPendingCreation(false);
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{candidate.name}</span>
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    {Math.round(candidate.score * 100)}%
                  </span>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{candidate.code}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {candidate.reasons.join(" · ")}
                </p>
              </button>
              <button
                type="button"
                aria-label="拒绝候选"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                onClick={() =>
                  startTransition(async () => {
                    const result = await rejectCaptureSkuCandidateAction(
                      captureId,
                      candidate.skuId
                    );
                    setMessage(result.success ? "已拒绝该候选" : result.error);
                    if (result.success) router.refresh();
                  })
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <MobileSkuMatcher
        lineNumber={99}
        query={title}
        searchEndpoint="/api/v1/product-intelligence/skus/search"
        selected={
          selected ? { skuId: selected.skuId, code: selected.code, name: selected.name } : null
        }
        pendingCreation={pendingCreation}
        onSelect={(candidate) => {
          setSelected(candidate);
          setPendingCreation(false);
        }}
        onCreatePending={
          canConfirm || (canPurchase && !hasPurchase)
            ? () => {
                setSelected(null);
                setPendingCreation(true);
              }
            : undefined
        }
        onClear={() => {
          setSelected(null);
          setPendingCreation(false);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {canConfirm && pendingCreation ? (
          <Button
            className="bg-amber-600 hover:bg-amber-700"
            disabled={pending || !canConfirm}
            onClick={createPendingSku}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackagePlus className="mr-2 h-4 w-4" />
            )}
            新建商品主档并写入价格
          </Button>
        ) : canConfirm ? (
          <Button
            disabled={!selected || pending || !canConfirm}
            onClick={() =>
              startTransition(async () => {
                const result = await confirmCaptureObservationAction(captureId, selected!.skuId);
                setMessage(result.success ? "已关联正式 SKU 并写入价格时间线" : result.error);
                if (result.success) router.refresh();
              })
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            归入商品主档
          </Button>
        ) : null}
        {canConfirm ? (
          <>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await refreshCaptureSkuCandidatesAction(captureId);
                  setMessage(result.success ? `已重新生成 ${result.count} 个候选` : result.error);
                  if (result.success) router.refresh();
                })
              }
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重新匹配
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await dismissCaptureAction(captureId);
                  if (!result.success) {
                    setMessage(result.error);
                    return;
                  }
                  router.push("/product-intelligence/captures");
                  router.refresh();
                })
              }
            >
              忽略
            </Button>
          </>
        ) : null}
        {canPurchase && !hasPurchase ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setPurchaseOpen((value) => !value)}
          >
            <ShoppingBag className="mr-2 h-4 w-4" />
            {purchaseOpen ? "收起采购" : "登记采购"}
          </Button>
        ) : null}
      </div>
      {purchaseOpen && canPurchase && !hasPurchase ? (
        <section className="space-y-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">按当前来源登记采购</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              默认使用采集价格；确认后生成采购记录，并把市场价格和采购价同时归入所选商品主档。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">
                购买单价（{currency}）
              </span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm font-semibold tabular-nums"
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">数量</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">购买日期</span>
              <input
                type="date"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-medium text-slate-600">运费（选填）</span>
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                inputMode="decimal"
                value={shippingFee}
                onChange={(event) => setShippingFee(event.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          <Button
            className="w-full"
            disabled={
              pending ||
              (!selected && !pendingCreation) ||
              !unitPrice.trim() ||
              !quantity.trim() ||
              !purchasedAt
            }
            onClick={() =>
              startTransition(async () => {
                const result = await createPurchaseFromCaptureAction({
                  captureId,
                  skuId: selected?.skuId,
                  createPendingSku: pendingCreation,
                  quantity,
                  unitPrice,
                  purchasedAt,
                  shippingFee,
                });
                if (!result.success) {
                  setMessage(result.error);
                  return;
                }
                setPurchaseOpen(false);
                setMessage(
                  result.purchaseOrderId
                    ? "采购单已生成，商品主档、采购价和市场价均已关联"
                    : "采购记录已生成，商品主档、采购价和市场价均已关联"
                );
                router.refresh();
              })
            }
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShoppingBag className="mr-2 h-4 w-4" />
            )}
            确认登记采购
          </Button>
        </section>
      ) : null}
      {!canConfirm ? (
        <p className="text-sm font-medium text-emerald-700">市场价格已经归入商品主档。</p>
      ) : null}
      {hasPurchase ? (
        <p className="text-sm font-medium text-emerald-700">已经从该来源生成采购记录。</p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}

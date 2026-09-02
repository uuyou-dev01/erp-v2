"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Loader2, Plus, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import {
  confirmMobilePriceAction,
  confirmMobilePurchaseAction,
} from "@/app/actions/mobile-capture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { uploadMobileAsset, type UploadedMobileAsset } from "@/lib/mobile/client-upload";
import {
  deleteOfflineDraft,
  loadOfflineDraft,
  saveOfflineDraft,
} from "@/lib/mobile/offline-drafts";
import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";
import { MobileSkuMatcher, type MobileSkuCandidate } from "@/components/mobile/mobile-sku-matcher";
import type { WebLinkPreview } from "@/lib/capture/web-link-parser";

type PurchaseLine = {
  localId: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  resolutionMode: "" | "EXISTING" | "CREATE_PENDING";
  brand: string;
  productName: string;
  variant: string;
  conditionType: string;
  quantity: string;
  unitPrice: string;
  note: string;
};

const currencies = ["CNY", "JPY", "USD", "HKD", "EUR", "GBP"];
const platforms = [
  "闲鱼",
  "Mercari",
  "千岛",
  "Amazon",
  "Yahoo拍卖",
  "Atmos",
  "淘宝",
  "微信",
  "线下",
  "其他",
];

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blankLine(): PurchaseLine {
  return {
    localId: uid(),
    skuId: "",
    skuCode: "",
    skuName: "",
    resolutionMode: "",
    brand: "",
    productName: "",
    variant: "",
    conditionType: "新品",
    quantity: "1",
    unitPrice: "",
    note: "",
  };
}

function normalizeMobileCondition(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "未标注";
  if (/未使用に近い|目立った傷や汚れなし|やや傷や汚れあり/.test(normalized)) return "中古";
  if (/新品|未使用|new/i.test(normalized)) return "新品";
  if (/瑕疵|破損|傷|汚れ|ジャンク|damage/i.test(normalized)) return "瑕疵";
  if (/中古|使用|used/i.test(normalized)) return "中古";
  return "未标注";
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-slate-600">{children}</label>;
}

async function uploadEvidence(files: FileList | null) {
  const assets: UploadedMobileAsset[] = [];
  for (const file of Array.from(files ?? [])) {
    assets.push(await uploadMobileAsset(file));
  }
  return assets;
}

export function MobileCaptureForm({
  mode,
  initial,
}: {
  mode: "price" | "purchase";
  initial?: { title?: string; sourceText?: string; sourceUrl?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [evidenceAssets, setEvidenceAssets] = useState<UploadedMobileAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [parsingSource, setParsingSource] = useState(false);
  const [priceCandidates, setPriceCandidates] = useState<
    Array<{ value: string; evidence: string }>
  >([]);
  const idempotencyKey = useMemo(uid, []);
  const [common, setCommon] = useState({
    platformName: mode === "purchase" ? "闲鱼" : "闲鱼",
    sourceUrl: initial?.sourceUrl ?? "",
    sourceText: initial?.sourceText ?? "",
    externalListingId: "",
    externalOrderNo: "",
    supplierName: "",
    title: initial?.title ?? "",
    skuId: "",
    skuCode: "",
    skuName: "",
    skuResolution: "",
    amount: "",
    currency: "CNY",
    conditionText: "新品",
    purchasedAt: new Date().toISOString().slice(0, 10),
    shippingFee: "",
    trackingNo: "",
    currentLocationText: "",
    visibility: "ORGANIZATION",
    note: "",
  });
  const [lines, setLines] = useState<PurchaseLine[]>([blankLine()]);
  const restored = useRef(false);
  const draftId = `capture:${mode}`;

  useEffect(() => {
    void loadOfflineDraft<{
      common: typeof common;
      lines: PurchaseLine[];
      evidenceAssets: UploadedMobileAsset[];
    }>(draftId).then((draft) => {
      if (draft) {
        setCommon(draft.common);
        setLines(draft.lines?.length ? draft.lines : [blankLine()]);
        setEvidenceAssets(draft.evidenceAssets ?? []);
        setMessage({ tone: "success", text: "已恢复上次未提交的本机草稿" });
      }
      restored.current = true;
    });
  }, [draftId]);

  useEffect(() => {
    if (!restored.current) return;
    const timeout = window.setTimeout(() => {
      void saveOfflineDraft(draftId, { common, lines, evidenceAssets });
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [common, draftId, evidenceAssets, lines]);

  const updateCommon = (name: string, value: string) => {
    setMessage(null);
    setCommon((current) => ({ ...current, [name]: value }));
  };

  const updateLine = (localId: string, name: keyof PurchaseLine, value: string) => {
    setMessage(null);
    setLines((current) =>
      current.map((line) => (line.localId === localId ? { ...line, [name]: value } : line))
    );
  };

  const selectLineSku = (localId: string, candidate: MobileSkuCandidate) => {
    setLines((current) =>
      current.map((line) =>
        line.localId === localId
          ? {
              ...line,
              skuId: candidate.skuId,
              skuCode: candidate.code,
              skuName: candidate.name,
              resolutionMode: "EXISTING",
              brand: line.brand || candidate.brand || "",
              productName: line.productName || candidate.parentName || candidate.name,
              variant: line.variant || candidate.variantLabel || "",
            }
          : line
      )
    );
  };

  const recognizeScreenshot = async () => {
    const asset = evidenceAssets.at(-1);
    if (!asset) return;
    setRecognizing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/mobile/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetId: asset.assetId,
          language: common.platformName === "Mercari" ? "jpn" : "chi_sim",
        }),
      });
      const result = (await response.json()) as {
        text?: string;
        priceCandidates?: Array<{ value: string; evidence: string }>;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message || "截图识别失败");
      const candidates = result.priceCandidates ?? [];
      setPriceCandidates(candidates);
      const firstLine =
        result.text
          ?.split(/\r?\n/)
          .map((line) => line.trim())
          .find(Boolean) || "";
      setCommon((current) => ({
        ...current,
        title: current.title || firstLine.slice(0, 120),
        sourceText: current.sourceText || result.text || "",
        amount: mode === "price" && candidates.length === 1 ? candidates[0].value : current.amount,
      }));
      if (mode === "purchase" && candidates.length === 1)
        setLines((current) =>
          current.map((line, index) =>
            index === 0 ? { ...line, unitPrice: line.unitPrice || candidates[0].value } : line
          )
        );
      setMessage({
        tone: "success",
        text: candidates.length
          ? `识别到 ${candidates.length} 个金额候选，请确认口径`
          : "已识别文字，未自动确定价格",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "截图识别失败" });
    } finally {
      setRecognizing(false);
    }
  };

  const parseSourceLink = async () => {
    if (!common.sourceUrl.trim()) return;
    setParsingSource(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/product-intelligence/captures/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: common.sourceUrl }),
      });
      const result = (await response.json()) as {
        preview?: WebLinkPreview;
        error?: { message?: string };
      };
      if (!response.ok || !result.preview) throw new Error(result.error?.message || "链接解析失败");
      const preview = result.preview;
      const conditionText = normalizeMobileCondition(preview.conditionText);
      setCommon((current) => ({
        ...current,
        platformName: preview.platformName,
        sourceUrl: preview.sourceUrl,
        sourceText: current.sourceText || preview.description,
        externalListingId: preview.externalListingId || current.externalListingId,
        title: mode === "price" ? preview.title || current.title : current.title,
        amount: mode === "price" ? preview.amount || current.amount : current.amount,
        currency: preview.currency || current.currency,
        conditionText,
        supplierName:
          mode === "purchase"
            ? preview.sellerName || preview.platformName || current.supplierName
            : current.supplierName,
      }));
      if (mode === "purchase") {
        setLines((current) =>
          current.map((line, index) =>
            index === 0
              ? {
                  ...line,
                  productName: preview.title || line.productName,
                  brand: preview.brand || line.brand,
                  unitPrice: preview.amount || line.unitPrice,
                  conditionType: conditionText,
                }
              : line
          )
        );
      }
      setMessage({
        tone: "success",
        text: preview.amount
          ? "已读取商品名称和价格，请核对后保存"
          : "已读取商品信息，价格仍需手动补充或从截图识别",
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "链接解析失败" });
    } finally {
      setParsingSource(false);
    }
  };

  const submit = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        await ensureMobileDeviceRegistered();
      } catch (error) {
        setMessage({
          tone: "error",
          text: error instanceof Error ? error.message : "设备绑定失败",
        });
        return;
      }
      const evidenceUrls = evidenceAssets.map((asset) => asset.url);
      const assetIds = evidenceAssets.map((asset) => asset.assetId);
      const rawPayload = { evidenceUrls, ocr: { priceCandidates } };
      const result =
        mode === "price"
          ? await confirmMobilePriceAction({
              captureType: evidenceUrls.length ? "SCREENSHOT" : "MANUAL",
              businessIntent: "OBSERVE_PRICE",
              idempotencyKey,
              sourceUrl: common.sourceUrl,
              sourceText: common.sourceText || evidenceUrls.join("\n"),
              platformName: common.platformName,
              externalListingId: common.externalListingId,
              title: common.title,
              skuId: common.skuId,
              amount: common.amount,
              currency: common.currency,
              conditionText: common.conditionText,
              visibility: common.visibility,
              note: common.note,
              rawPayload,
              assetIds,
            })
          : await confirmMobilePurchaseAction({
              captureType: evidenceUrls.length ? "SCREENSHOT" : "MANUAL",
              businessIntent: "RECORD_PURCHASE",
              idempotencyKey,
              sourceUrl: common.sourceUrl,
              sourceText: common.sourceText || evidenceUrls.join("\n"),
              platformName: common.platformName,
              externalListingId: common.externalListingId,
              title: lines
                .map((line) => line.productName)
                .filter(Boolean)
                .join(" / "),
              currency: common.currency,
              conditionText: lines[0]?.conditionType,
              visibility: common.visibility,
              supplierName: common.supplierName,
              externalOrderNo: common.externalOrderNo,
              purchasedAt: common.purchasedAt,
              shippingFee: common.shippingFee,
              trackingNo: common.trackingNo,
              currentLocationText: common.currentLocationText,
              note: common.note,
              lines: lines.map(
                ({ localId: _localId, skuCode: _skuCode, skuName: _skuName, ...line }) => ({
                  ...line,
                  resolutionMode: line.resolutionMode || undefined,
                })
              ),
              rawPayload,
              assetIds,
            });
      if (!result.success) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      setMessage({
        tone: "success",
        text:
          mode === "price"
            ? "observationId" in result && result.observationId
              ? "价格已进入市场参考时间线"
              : "价格证据已保存，等待匹配 SKU"
            : "购入已登记，后续物流节点已进入待办",
      });
      await deleteOfflineDraft(draftId);
      window.setTimeout(() => router.push(mode === "purchase" ? "/m" : "/m/capture"), 900);
    });

  return (
    <form
      className="space-y-5 pb-28"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>来源平台 *</Label>
          <Select
            className="h-12 rounded-xl"
            value={common.platformName}
            onChange={(event) => updateCommon("platformName", event.target.value)}
          >
            {platforms.map((platform) => (
              <option key={platform}>{platform}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>币种 *</Label>
          <Select
            className="h-12 rounded-xl"
            value={common.currency}
            onChange={(event) => updateCommon("currency", event.target.value)}
          >
            {currencies.map((currency) => (
              <option key={currency}>{currency}</option>
            ))}
          </Select>
        </div>
      </div>

      {mode === "price" ? (
        <>
          <div>
            <Label>商品名称</Label>
            <Input
              className="h-12 rounded-xl text-base"
              required
              value={common.title}
              onChange={(event) => updateCommon("title", event.target.value)}
              placeholder="例如：Bearbrick 1000% 黑色"
            />
          </div>
          <MobileSkuMatcher
            lineNumber={0}
            query={common.title}
            selected={
              common.skuId
                ? { skuId: common.skuId, code: common.skuCode, name: common.skuName }
                : null
            }
            pendingCreation={common.skuResolution === "KEEP_UNMATCHED"}
            unmatchedLabel="暂不匹配，进入采集箱"
            required={false}
            onSelect={(candidate) =>
              setCommon((current) => ({
                ...current,
                skuId: candidate.skuId,
                skuCode: candidate.code,
                skuName: candidate.name,
                skuResolution: "EXISTING",
                title: current.title || candidate.name,
              }))
            }
            onCreatePending={() =>
              setCommon((current) => ({
                ...current,
                skuId: "",
                skuCode: "",
                skuName: "",
                skuResolution: "KEEP_UNMATCHED",
              }))
            }
            onClear={() =>
              setCommon((current) => ({
                ...current,
                skuId: "",
                skuCode: "",
                skuName: "",
                skuResolution: "",
              }))
            }
          />
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div>
              <Label>看到的价格 *</Label>
              <Input
                inputMode="decimal"
                className="h-12 rounded-xl text-lg font-semibold"
                required
                value={common.amount}
                onChange={(event) => updateCommon("amount", event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>成色</Label>
              <Select
                className="h-12 rounded-xl"
                value={common.conditionText}
                onChange={(event) => updateCommon("conditionText", event.target.value)}
              >
                <option>新品</option>
                <option>中古</option>
                <option>瑕疵</option>
                <option>未标注</option>
              </Select>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>卖家/供应商</Label>
              <Input
                aria-label="卖家或供应商"
                className="h-12 rounded-xl"
                value={common.supplierName}
                onChange={(event) => updateCommon("supplierName", event.target.value)}
                placeholder="卖家备注名"
              />
            </div>
            <div>
              <Label>订单号</Label>
              <Input
                aria-label="外部订单号"
                className="h-12 rounded-xl"
                value={common.externalOrderNo}
                onChange={(event) => updateCommon("externalOrderNo", event.target.value)}
                placeholder="可留空"
              />
            </div>
          </div>
          {lines.map((line, index) => (
            <section key={line.localId} className="rounded-2xl border border-slate-200 p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">商品 {index + 1}</p>
                {lines.length > 1 ? (
                  <button
                    type="button"
                    aria-label="删除商品"
                    className="text-slate-400"
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.localId !== line.localId))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <div>
                <Label>商品名称 *</Label>
                <Input
                  aria-label={`商品 ${index + 1} 名称`}
                  className="h-11 rounded-xl"
                  required
                  value={line.productName}
                  onChange={(event) => updateLine(line.localId, "productName", event.target.value)}
                />
              </div>
              <div className="mt-3">
                <Label>规格</Label>
                <Input
                  aria-label={`商品 ${index + 1} 规格`}
                  className="h-11 rounded-xl"
                  value={line.variant}
                  onChange={(event) => updateLine(line.localId, "variant", event.target.value)}
                  placeholder="颜色、尺寸、版本"
                />
              </div>
              <div className="mt-3">
                <MobileSkuMatcher
                  lineNumber={index + 1}
                  query={line.productName}
                  brand={line.brand}
                  variant={line.variant}
                  selected={
                    line.skuId
                      ? { skuId: line.skuId, code: line.skuCode, name: line.skuName }
                      : null
                  }
                  pendingCreation={line.resolutionMode === "CREATE_PENDING"}
                  onSelect={(candidate) => selectLineSku(line.localId, candidate)}
                  onCreatePending={() =>
                    setLines((current) =>
                      current.map((item) =>
                        item.localId === line.localId
                          ? {
                              ...item,
                              skuId: "",
                              skuCode: "",
                              skuName: "",
                              resolutionMode: "CREATE_PENDING",
                            }
                          : item
                      )
                    )
                  }
                  onClear={() =>
                    setLines((current) =>
                      current.map((item) =>
                        item.localId === line.localId
                          ? { ...item, skuId: "", skuCode: "", skuName: "", resolutionMode: "" }
                          : item
                      )
                    )
                  }
                />
              </div>
              <div className="mt-3 grid grid-cols-[78px_1fr_100px] gap-2">
                <div>
                  <Label>数量 *</Label>
                  <Input
                    aria-label={`商品 ${index + 1} 数量`}
                    inputMode="decimal"
                    className="h-11 rounded-xl"
                    required
                    value={line.quantity}
                    onChange={(event) => updateLine(line.localId, "quantity", event.target.value)}
                  />
                </div>
                <div>
                  <Label>商品单价 *</Label>
                  <Input
                    aria-label={`商品 ${index + 1} 单价`}
                    inputMode="decimal"
                    className="h-11 rounded-xl"
                    required
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.localId, "unitPrice", event.target.value)}
                  />
                </div>
                <div>
                  <Label>成色</Label>
                  <Select
                    aria-label={`商品 ${index + 1} 成色`}
                    className="h-11 rounded-xl"
                    value={line.conditionType}
                    onChange={(event) =>
                      updateLine(line.localId, "conditionType", event.target.value)
                    }
                  >
                    <option>新品</option>
                    <option>中古</option>
                    <option>瑕疵</option>
                  </Select>
                </div>
              </div>
            </section>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-xl border-dashed"
            onClick={() => setLines((current) => [...current, blankLine()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            添加同一订单的商品
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>购买日期 *</Label>
              <Input
                type="date"
                className="h-12 rounded-xl"
                required
                value={common.purchasedAt}
                onChange={(event) => updateCommon("purchasedAt", event.target.value)}
              />
            </div>
            <div>
              <Label>整单运费</Label>
              <Input
                inputMode="decimal"
                className="h-12 rounded-xl"
                value={common.shippingFee}
                onChange={(event) => updateCommon("shippingFee", event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>物流单号</Label>
            <Input
              className="h-12 rounded-xl"
              value={common.trackingNo}
              onChange={(event) => updateCommon("trackingNo", event.target.value)}
              placeholder="没有可稍后补"
            />
          </div>
        </>
      )}

      <div>
        <Label>来源链接</Label>
        <div className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            className="h-12 min-w-0 rounded-xl"
            value={common.sourceUrl}
            onChange={(event) => updateCommon("sourceUrl", event.target.value)}
            placeholder="粘贴 Mercari、闲鱼等商品链接"
          />
          <Button
            type="button"
            variant="outline"
            aria-label="读取商品链接"
            className="h-12 shrink-0 rounded-xl px-3"
            disabled={!common.sourceUrl.trim() || parsingSource}
            onClick={parseSourceLink}
          >
            {parsingSource ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ScanSearch className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">读取</span>
          </Button>
        </div>
      </div>
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center">
        {uploading ? (
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        ) : (
          <Camera className="h-5 w-5 text-slate-400" />
        )}
        <span className="mt-2 text-sm font-medium text-slate-600">拍照或添加截图证据</span>
        <span className="mt-1 text-[11px] text-slate-400">已添加 {evidenceAssets.length} 张</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={async (event) => {
            setUploading(true);
            try {
              const uploaded = await uploadEvidence(event.target.files);
              setEvidenceAssets((current) => [...current, ...uploaded]);
            } catch (error) {
              setMessage({
                tone: "error",
                text: error instanceof Error ? error.message : "上传失败",
              });
            } finally {
              setUploading(false);
              event.target.value = "";
            }
          }}
        />
      </label>
      {evidenceAssets.length ? (
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-xl"
          disabled={recognizing}
          onClick={recognizeScreenshot}
        >
          {recognizing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4 text-blue-600" />
          )}
          识别最近一张截图
        </Button>
      ) : null}
      {priceCandidates.length > 1 ? (
        <div className="rounded-2xl bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900">
            截图中有多个金额，请选择本次记录的口径
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {priceCandidates.map((candidate, index) => (
              <button
                key={`${candidate.value}-${index}`}
                type="button"
                title={candidate.evidence}
                onClick={() => {
                  if (mode === "price") updateCommon("amount", candidate.value);
                  else
                    setLines((current) =>
                      current.map((line, lineIndex) =>
                        lineIndex === 0 ? { ...line, unitPrice: candidate.value } : line
                      )
                    );
                }}
                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-800 shadow-sm"
              >
                {common.currency} {candidate.value}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <Label>备注/原始文字</Label>
        <Textarea
          className="min-h-20 rounded-xl"
          value={common.note}
          onChange={(event) => updateCommon("note", event.target.value)}
          placeholder={
            mode === "purchase" ? "瑕疵、批次、付款说明等" : "卖家描述或看到价格时的上下文"
          }
        />
      </div>
      {message ? (
        <div
          role="alert"
          className={`flex gap-2 rounded-xl px-3 py-3 text-sm ${message.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
        >
          {message.tone === "success" ? <Check className="mt-0.5 h-4 w-4" /> : null}
          {message.text}
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-[72px] z-30 mx-auto max-w-[520px] border-t border-slate-100 bg-white/95 p-3 backdrop-blur-xl">
        <Button
          type="submit"
          disabled={pending || uploading}
          className="h-12 w-full rounded-xl bg-blue-600 text-[15px] font-semibold shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {mode === "price" ? "保存价格事实" : "确认已经购买"}
        </Button>
      </div>
    </form>
  );
}

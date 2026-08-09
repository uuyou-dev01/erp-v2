"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileStack,
  Loader2,
  RotateCcw,
  ScanSearch,
} from "lucide-react";
import { saveWebLinkCaptureBatchAction } from "@/app/actions/captures";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { WebLinkPreview } from "@/lib/capture/web-link-parser";

type EditableFields = Pick<WebLinkPreview, "title" | "amount" | "currency" | "conditionText">;

type BatchRow = {
  input: string;
  idempotencyKey: string;
  selected: boolean;
  preview?: WebLinkPreview;
  fields?: EditableFields;
  error?: string;
  saveState: "IDLE" | "SAVED" | "FAILED";
  saveError?: string;
  imageWarning?: string;
  reviewUrl?: string;
};

const pageStatusLabel: Record<WebLinkPreview["pageStatus"], string> = {
  ACTIVE: "在售",
  SOLD_OUT: "已售罄",
  UNAVAILABLE: "不可用",
  UNKNOWN: "未知",
};

function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `web-link:${crypto.randomUUID()}`
    : `web-link:${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function linkCount(value: string) {
  return value.match(/https?:\/\/[^\s<>"'」】]+/gi)?.length ?? 0;
}

export function WebLinkCapture() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);

  const detectedLinks = linkCount(input);
  const parsedRows = rows.filter((row) => row.preview);
  const selectedRows = parsedRows.filter(
    (row) =>
      row.selected &&
      row.saveState !== "SAVED" &&
      row.fields?.title.trim() &&
      row.fields.amount.trim()
  );
  const totals = useMemo(
    () => ({
      success: parsedRows.length,
      failed: rows.filter((row) => row.error).length,
      saved: rows.filter((row) => row.saveState === "SAVED").length,
    }),
    [parsedRows.length, rows]
  );

  const parseLinks = async () => {
    setMessage(null);
    setRows([]);
    setDuplicateCount(0);
    setParsing(true);
    try {
      const response = await fetch("/api/v1/product-intelligence/captures/preview/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const body = (await response.json()) as {
        duplicateCount?: number;
        results?: Array<
          | { input: string; success: true; preview: WebLinkPreview }
          | { input: string; success: false; error: string }
        >;
        error?: { message?: string };
      };
      if (!response.ok || !body.results) throw new Error(body.error?.message || "批量解析失败");
      setDuplicateCount(body.duplicateCount ?? 0);
      setRows(
        body.results.map((result) =>
          result.success
            ? {
                input: result.input,
                idempotencyKey: newIdempotencyKey(),
                selected: Boolean(result.preview.title && result.preview.amount),
                preview: result.preview,
                fields: {
                  title: result.preview.title,
                  amount: result.preview.amount,
                  currency: result.preview.currency,
                  conditionText: result.preview.conditionText,
                },
                saveState: "IDLE" as const,
              }
            : {
                input: result.input,
                idempotencyKey: newIdempotencyKey(),
                selected: false,
                error: result.error,
                saveState: "IDLE" as const,
              }
        )
      );
      const validCount = body.results.filter((result) => result.success).length;
      setMessage({
        tone: "success",
        text: `已解析 ${validCount} 个商品${body.duplicateCount ? `，忽略 ${body.duplicateCount} 条重复链接` : ""}。保存前请核对价格。`,
      });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "批量解析失败" });
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (idempotencyKey: string, update: Partial<BatchRow>) => {
    setRows((current) =>
      current.map((row) => (row.idempotencyKey === idempotencyKey ? { ...row, ...update } : row))
    );
  };

  const updateFields = (row: BatchRow, update: Partial<EditableFields>) => {
    if (!row.fields) return;
    updateRow(row.idempotencyKey, { fields: { ...row.fields, ...update }, saveState: "IDLE" });
  };

  const saveSelected = () => {
    if (!selectedRows.length) return;
    setMessage(null);
    startTransition(async () => {
      const result = await saveWebLinkCaptureBatchAction(
        selectedRows.map((row) => ({
          idempotencyKey: row.idempotencyKey,
          preview: row.preview!,
          ...row.fields!,
          selectedImageUrls: row.preview!.imageUrls,
        }))
      );
      if (!result.success) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      const byKey = new Map(result.items.map((item) => [item.idempotencyKey, item]));
      setRows((current) =>
        current.map((row) => {
          const item = byKey.get(row.idempotencyKey);
          if (!item) return row;
          return item.success
            ? {
                ...row,
                saveState: "SAVED",
                reviewUrl: item.reviewUrl,
                imageWarning: item.imageImportFailures.length
                  ? `${item.imageImportFailures.length} 张来源图暂未转存，原链接已保留`
                  : undefined,
              }
            : { ...row, saveState: "FAILED", saveError: item.error };
        })
      );
      const saved = result.items.filter((item) => item.success).length;
      const failed = result.items.length - saved;
      const imageFailures = result.items.reduce(
        (total, item) => total + (item.success ? item.imageImportFailures.length : 0),
        0
      );
      setMessage({
        tone: failed || imageFailures ? "error" : "success",
        text: failed
          ? `已保存 ${saved} 个，${failed} 个失败，请检查后重试。`
          : imageFailures
            ? `已保存 ${saved} 个商品；${imageFailures} 张来源图暂未转存，原链接已保留，可在审核时重试。`
            : `已将 ${saved} 个商品加入商品情报采集箱。`,
      });
      router.refresh();
    });
  };

  const reset = () => {
    setRows([]);
    setInput("");
    setDuplicateCount(0);
    setMessage(null);
  };

  return (
    <section
      aria-labelledby="web-link-capture-heading"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <div className="border-b bg-slate-50/70 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FileStack className="h-4 w-4 text-blue-600" />
              <h2 id="web-link-capture-heading" className="text-sm font-semibold text-slate-950">
                批量采集商品链接
              </h2>
            </div>
            <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-500">
              一行一个链接，也可以直接粘贴整段内容。系统先去重再并发读取，最多 12
              个；保存后统一进入采集箱审核。
            </p>
            <Textarea
              aria-label="商品链接列表"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="mt-4 min-h-28 resize-y rounded-lg bg-white font-mono text-xs leading-6 shadow-none"
              placeholder={"https://jp.mercari.com/item/…\nhttps://jp.mercari.com/item/…"}
            />
          </div>
          <div className="flex shrink-0 gap-2">
            {rows.length ? (
              <Button
                variant="outline"
                className="h-11"
                disabled={pending || parsing}
                onClick={reset}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                清空
              </Button>
            ) : null}
            <Button
              className="h-11 min-w-32"
              disabled={!detectedLinks || parsing || pending}
              onClick={() => void parseLinks()}
            >
              {parsing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ScanSearch className="mr-2 h-4 w-4" />
              )}
              {parsing ? "正在读取" : `解析${detectedLinks > 1 ? ` ${detectedLinks} 条` : "商品"}`}
            </Button>
          </div>
        </div>
      </div>

      {message ? (
        <div
          role="status"
          className={`flex items-center gap-2 px-5 py-3 text-xs ${message.tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}
        >
          {message.tone === "error" ? (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          ) : (
            <Check className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      ) : null}

      {rows.length ? (
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-5 py-3 text-xs text-slate-500">
            <span>
              <strong className="text-slate-900">{totals.success}</strong> 个可用
            </span>
            {duplicateCount ? (
              <span>
                <strong className="text-slate-900">{duplicateCount}</strong> 个重复
              </span>
            ) : null}
            {totals.failed ? (
              <span>
                <strong className="text-rose-700">{totals.failed}</strong> 个失败
              </span>
            ) : null}
            {totals.saved ? (
              <span>
                <strong className="text-emerald-700">{totals.saved}</strong> 个已保存
              </span>
            ) : null}
            <label className="ml-auto inline-flex items-center gap-2 font-medium text-slate-700">
              <input
                type="checkbox"
                checked={
                  parsedRows.length > 0 &&
                  parsedRows.every((row) => row.selected || row.saveState === "SAVED")
                }
                onChange={(event) =>
                  setRows((current) =>
                    current.map((row) =>
                      row.preview && row.saveState !== "SAVED"
                        ? { ...row, selected: event.target.checked }
                        : row
                    )
                  )
                }
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              全选可用项
            </label>
          </div>

          <div className="divide-y">
            {rows.map((row, index) =>
              row.preview && row.fields ? (
                <article
                  key={row.idempotencyKey}
                  className={`grid gap-4 p-4 lg:grid-cols-[28px_64px_minmax(240px,1fr)_140px_110px_130px] lg:items-center ${row.saveState === "SAVED" ? "bg-emerald-50/40" : ""}`}
                >
                  <input
                    aria-label={`选择第 ${index + 1} 个商品`}
                    type="checkbox"
                    checked={row.selected || row.saveState === "SAVED"}
                    disabled={row.saveState === "SAVED"}
                    onChange={(event) =>
                      updateRow(row.idempotencyKey, { selected: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-blue-600"
                  />
                  <div className="h-16 w-16 overflow-hidden rounded-lg border bg-slate-100">
                    {row.preview.imageUrls[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.preview.imageUrls[0]}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Input
                      aria-label={`第 ${index + 1} 个商品名称`}
                      value={row.fields.title}
                      onChange={(event) => updateFields(row, { title: event.target.value })}
                      className="h-9 font-medium"
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-700">
                        {row.preview.platformName}
                      </span>
                      <span>{pageStatusLabel[row.preview.pageStatus]}</span>
                      <span>{row.preview.conditionText || "成色未标注"}</span>
                      <span>{row.preview.imageUrls.length} 张图</span>
                      {row.preview.externalListingId ? (
                        <span className="font-mono">{row.preview.externalListingId}</span>
                      ) : null}
                      <a
                        href={row.preview.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600"
                      >
                        原页 <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <label>
                    <span className="mb-1 block text-[11px] text-slate-500">看到的价格</span>
                    <Input
                      inputMode="decimal"
                      value={row.fields.amount}
                      onChange={(event) => updateFields(row, { amount: event.target.value })}
                      className="h-9 font-semibold tabular-nums"
                      placeholder="待补价格"
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[11px] text-slate-500">币种</span>
                    <Select
                      value={row.fields.currency}
                      onChange={(event) => updateFields(row, { currency: event.target.value })}
                      className="h-9"
                    >
                      {["CNY", "JPY", "USD", "HKD", "EUR", "GBP"].map((currency) => (
                        <option key={currency}>{currency}</option>
                      ))}
                    </Select>
                  </label>
                  <div className="lg:text-right">
                    {row.saveState === "SAVED" && row.reviewUrl ? (
                      <div className="space-y-1.5 lg:text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={row.reviewUrl}>打开审核</Link>
                        </Button>
                        {row.imageWarning ? (
                          <p className="text-[11px] leading-4 text-amber-700">
                            {row.imageWarning}
                          </p>
                        ) : null}
                      </div>
                    ) : row.saveState === "FAILED" ? (
                      <p className="text-xs text-rose-700">{row.saveError}</p>
                    ) : !row.fields.amount.trim() ? (
                      <span className="text-xs font-medium text-amber-700">请补价格</span>
                    ) : (
                      <span className="text-xs text-slate-400">待保存</span>
                    )}
                  </div>
                </article>
              ) : (
                <div key={row.idempotencyKey} className="flex items-start gap-3 p-4 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-500">{row.input}</p>
                    <p className="mt-1 text-rose-700">{row.error}</p>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="flex flex-col gap-3 border-t bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-500">
              保存后逐条确认商品主档；需要采购时，可在审核页直接选择“登记采购”。
            </p>
            <Button
              className="h-11 min-w-40"
              disabled={!selectedRows.length || pending}
              onClick={saveSelected}
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              保存选中的 {selectedRows.length} 个
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

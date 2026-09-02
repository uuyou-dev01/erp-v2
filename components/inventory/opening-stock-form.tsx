"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  Plus,
  Trash2,
  Warehouse,
} from "lucide-react";
import {
  createOpeningStockAction,
  type OpeningStockTrackingMode,
} from "@/app/actions/opening-stock";
import { createSKUAction } from "@/app/actions/skus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog } from "@/components/ui/action-dialog";
import { safeInternalReturnPath } from "@/lib/application/return-navigation";

interface OpeningStockSkuOption {
  id: string;
  code: string;
  name: string;
  catalogRole: string;
  parentName: string | null;
}

interface OpeningStockLocationOption {
  id: string;
  code: string;
  name: string;
  region: string | null;
}

interface OpeningStockFormProps {
  storeId: string;
  defaultCurrency: string;
  defaultDate: string;
  skus: OpeningStockSkuOption[];
  locations: OpeningStockLocationOption[];
  presetSkuIds?: string[];
  createdSkuId?: string;
  createdLocationId?: string;
  fixedLocationId?: string;
  returnTo?: string;
  locationCreateReturnTo?: string;
  skuCreateReturnTo?: string;
}

interface EditableLine {
  key: string;
  skuId: string;
  locationId: string;
  trackingMode: OpeningStockTrackingMode;
  quantity: string;
  unitCost: string;
  currency: string;
  batchLabel: string;
  conditionGrade: string;
  note: string;
}

interface OpeningStockDraft {
  openingAt: string;
  note: string;
  lines: EditableLine[];
  targetLineKey: string | null;
}

function makeLine(currency: string, locationId: string, skuId = "", key: string): EditableLine {
  return {
    key,
    skuId,
    locationId,
    trackingMode: "LOT",
    quantity: "",
    unitCost: "",
    currency,
    batchLabel: "",
    conditionGrade: "",
    note: "",
  };
}

function isCompleteLine(line: EditableLine) {
  const quantity = Number(line.quantity);
  const unitCost = Number(line.unitCost);
  return (
    Boolean(line.skuId) &&
    Boolean(line.locationId) &&
    Number.isFinite(quantity) &&
    quantity > 0 &&
    line.unitCost.trim() !== "" &&
    Number.isFinite(unitCost) &&
    unitCost >= 0 &&
    Boolean(line.currency)
  );
}

export function OpeningStockForm({
  storeId,
  defaultCurrency,
  defaultDate,
  skus,
  locations,
  presetSkuIds = [],
  createdSkuId,
  createdLocationId,
  fixedLocationId,
  returnTo = "/inventory/opening-stock",
  locationCreateReturnTo,
  skuCreateReturnTo,
}: OpeningStockFormProps) {
  const router = useRouter();
  const safeReturnTo = safeInternalReturnPath(returnTo);
  const draftKey = `opening-stock-draft:${storeId}:${fixedLocationId ?? "all"}`;
  const defaultLocationId =
    locations.find((location) => location.id === fixedLocationId)?.id ??
    locations.find((location) => location.id === createdLocationId)?.id ??
    (locations.length === 1 ? locations[0]?.id : undefined) ??
    "";
  const validPresetIds = [
    ...new Set(presetSkuIds.filter((id) => skus.some((sku) => sku.id === id))),
  ];
  const [openingAt, setOpeningAt] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [skuOptions, setSkuOptions] = useState(skus);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    validPresetIds.length > 0
      ? validPresetIds.map((skuId) =>
          makeLine(defaultCurrency, defaultLocationId, skuId, `initial-${skuId}`)
        )
      : [makeLine(defaultCurrency, defaultLocationId, "", "initial-empty")]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quickSkuOpen, setQuickSkuOpen] = useState(false);
  const [quickSkuName, setQuickSkuName] = useState("");
  const [quickSkuCode, setQuickSkuCode] = useState("");
  const [quickSkuLoading, setQuickSkuLoading] = useState(false);
  const [quickSkuError, setQuickSkuError] = useState<string | null>(null);
  const [quickSkuTargetLineKey, setQuickSkuTargetLineKey] = useState<string | null>(null);
  const [quickCreatedSku, setQuickCreatedSku] = useState<{ id: string; name: string } | null>(null);
  const addedLineSequence = useRef(0);

  useEffect(() => {
    const rawDraft = window.sessionStorage.getItem(draftKey);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<OpeningStockDraft>;
      if (typeof draft.openingAt === "string" && draft.openingAt) {
        setOpeningAt(draft.openingAt);
      }
      if (typeof draft.note === "string") setNote(draft.note);
      if (Array.isArray(draft.lines) && draft.lines.length > 0) {
        const restoredLines = draft.lines.map((line) => ({ ...line }));
        if (createdSkuId) {
          const targetIndex = restoredLines.findIndex((line) => line.key === draft.targetLineKey);
          const fallbackIndex = restoredLines.findIndex((line) => !line.skuId);
          const selectedIndex = targetIndex >= 0 ? targetIndex : fallbackIndex;
          if (selectedIndex >= 0) {
            restoredLines[selectedIndex] = {
              ...restoredLines[selectedIndex],
              skuId: createdSkuId,
            };
          } else {
            restoredLines.push(
              makeLine(defaultCurrency, defaultLocationId, createdSkuId, `restored-${createdSkuId}`)
            );
          }
        }
        setLines(restoredLines);
      }
    } catch {
      // Ignore an invalid local draft and continue with server-provided defaults.
    } finally {
      window.sessionStorage.removeItem(draftKey);
    }
  }, [createdSkuId, defaultCurrency, defaultLocationId, draftKey]);

  const addLine = () => {
    addedLineSequence.current += 1;
    const key = `added-${Date.now()}-${addedLineSequence.current}`;
    setLines((current) => [...current, makeLine(defaultCurrency, defaultLocationId, "", key)]);
  };

  const completeLines = useMemo(() => lines.filter(isCompleteLine), [lines]);
  const totals = useMemo(() => {
    const result = new Map<string, { quantity: number; value: number }>();
    for (const line of completeLines) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      const current = result.get(line.currency) ?? { quantity: 0, value: 0 };
      current.quantity += quantity;
      current.value += quantity * unitCost;
      result.set(line.currency, current);
    }
    return Array.from(result.entries());
  }, [completeLines]);
  const firstIncompleteLine = lines.findIndex((line) => !isCompleteLine(line));
  const canSubmit = Boolean(openingAt) && lines.length > 0 && firstIncompleteLine === -1;
  const skuCount = new Set(completeLines.map((line) => line.skuId)).size;
  const locationCount = new Set(completeLines.map((line) => line.locationId)).size;
  const createdSku = skuOptions.find((sku) => sku.id === createdSkuId);
  const createdLocation = locations.find((location) => location.id === createdLocationId);

  const updateLine = (key: string, patch: Partial<EditableLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const openQuickSku = (lineKey: string) => {
    setQuickSkuTargetLineKey(lineKey);
    setQuickSkuName("");
    setQuickSkuCode("");
    setQuickSkuError(null);
    setQuickSkuOpen(true);
  };

  const saveDraftForProductCreation = () => {
    const draft: OpeningStockDraft = {
      openingAt,
      note,
      lines,
      targetLineKey: quickSkuTargetLineKey,
    };
    window.sessionStorage.setItem(draftKey, JSON.stringify(draft));
  };

  const createQuickSku = async () => {
    const name = quickSkuName.trim();
    const code = quickSkuCode.trim();
    if (!name) {
      setQuickSkuError("请填写商品名称");
      return;
    }

    setQuickSkuError(null);
    setQuickSkuLoading(true);
    try {
      const result = await createSKUAction({
        storeId,
        catalogRole: "SIMPLE",
        name,
        code: code || undefined,
        nameSource: "MANUAL",
        codeSource: code ? "MANUAL" : "AUTO",
      });
      if (!result.success) {
        setQuickSkuError(result.error);
        return;
      }

      const option: OpeningStockSkuOption = {
        id: result.id,
        code: result.code,
        name: result.name,
        catalogRole: result.catalogRole,
        parentName: null,
      };
      setSkuOptions((current) => [...current, option]);
      if (quickSkuTargetLineKey) {
        updateLine(quickSkuTargetLineKey, { skuId: option.id });
      }
      setQuickCreatedSku({ id: option.id, name: option.name });
      setQuickSkuOpen(false);
      router.refresh();
    } catch (createError) {
      setQuickSkuError(createError instanceof Error ? createError.message : "创建商品失败，请重试");
    } finally {
      setQuickSkuLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setConfirmOpen(true);
  };

  const confirmSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createOpeningStockAction({
        storeId,
        openingAt: `${openingAt}T00:00:00+08:00`,
        note,
        lines: lines.map(({ key: _key, ...line }) => line),
      });
      if (!result.success) {
        setError(result.error);
        setConfirmOpen(false);
        return;
      }
      const detailParams = new URLSearchParams();
      if (safeReturnTo) detailParams.set("returnTo", safeReturnTo);
      router.push(
        `/inventory/opening-stock/${result.id}${
          detailParams.size > 0 ? `?${detailParams.toString()}` : ""
        }`
      );
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "生成失败，请重试");
      setConfirmOpen(false);
    } finally {
      setLoading(false);
    }
  };

  if (locations.length === 0 || skus.length === 0) {
    const locationHref = `/inventory/locations?${new URLSearchParams({
      create: "1",
      returnTo: locationCreateReturnTo ?? returnTo,
    }).toString()}`;
    const skuHref = `/inventory/skus/new?${new URLSearchParams({
      returnTo: skuCreateReturnTo ?? returnTo,
    }).toString()}`;

    return (
      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="border-b px-5 py-4">
          <h2 className="font-semibold">开始前，先准备库存位置和商品</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            录入已有库存至少需要一个存放位置和一个可承接库存的具体商品。完成创建后会自动回到这里并选中新建内容。
          </p>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Warehouse className="mt-0.5 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">1. 设置存放位置</h3>
                  {locations.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  明确库存实际存放在哪里，避免库存记到错误的位置。
                </p>
                {locations.length === 0 ? (
                  <Button asChild size="sm" className="mt-4">
                    <Link href={locationHref}>创建库存位置</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <PackagePlus className="mt-0.5 h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">2. 创建可入库商品</h3>
                  {skus.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> 已完成
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  商品组不能直接记录库存；多规格商品需要先创建至少一个具体规格。
                </p>
                {skus.length === 0 ? (
                  <Button asChild size="sm" className="mt-4">
                    <Link href={skuHref}>创建商品并返回</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3 text-sm">
          <p className="text-muted-foreground">
            如果开始使用系统时没有现有库存，不需要完成这一步。
          </p>
          <Button asChild variant="ghost" size="sm">
            <Link href="/procurement/new">
              从采购单开始
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {createdSku || createdLocation ? (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {[
                createdLocation ? `存放位置「${createdLocation.name}」` : null,
                createdSku ? `商品「${createdSku.name}」` : null,
              ]
                .filter(Boolean)
                .join("、")}
              已创建并选入库存明细。
            </p>
          </div>
        ) : null}

        <section className="rounded-lg border bg-background">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">本次录入</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              设置已有库存从哪一天开始计入系统，并补充本次录入说明。
            </p>
          </div>
          <div className="grid gap-4 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="opening-stock-date">库存生效日期 *</Label>
              <Input
                id="opening-stock-date"
                type="date"
                value={openingAt}
                onChange={(event) => setOpeningAt(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">这些数量将作为当天开始时的库存余额。</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opening-stock-note">录入说明</Label>
              <Textarea
                id="opening-stock-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="例如：系统上线前仓库盘点结果（2026 年 9 月）"
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">库存明细</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                每行对应一个商品在一个位置中的一组库存；批次或成本不同，请分行录入。
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-1.5 h-4 w-4" />
              添加一行
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1260px] text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="w-[300px] px-3 py-2 font-medium">商品 *</th>
                  <th className="w-[170px] px-3 py-2 font-medium">存放位置 *</th>
                  <th className="w-[125px] px-3 py-2 font-medium">库存跟踪方式</th>
                  <th className="w-[105px] px-3 py-2 font-medium">期初数量 *</th>
                  <th className="w-[125px] px-3 py-2 font-medium">期初单位成本 *</th>
                  <th className="w-[95px] px-3 py-2 font-medium">成本币种</th>
                  <th className="w-[150px] px-3 py-2 font-medium">批次号</th>
                  <th className="w-[130px] px-3 py-2 font-medium">品相等级</th>
                  <th className="min-w-[160px] px-3 py-2 font-medium">备注</th>
                  <th className="w-12 px-2 py-2">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, index) => (
                  <tr key={line.key} className="align-top">
                    <td className="px-3 py-2">
                      <Label className="sr-only" htmlFor={`opening-sku-${line.key}`}>
                        第 {index + 1} 行商品
                      </Label>
                      <div className="flex items-start gap-1.5">
                        <Select
                          id={`opening-sku-${line.key}`}
                          className="h-9 min-w-0 flex-1"
                          value={line.skuId}
                          onChange={(event) => updateLine(line.key, { skuId: event.target.value })}
                          required
                        >
                          <option value="">选择商品</option>
                          {skuOptions.map((sku) => (
                            <option key={sku.id} value={sku.id}>
                              {sku.parentName && !sku.name.startsWith(sku.parentName)
                                ? `${sku.parentName} · `
                                : ""}
                              {sku.name} · {sku.code}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          aria-label={`为第 ${index + 1} 行新建商品`}
                          title="新建商品"
                          onClick={() => openQuickSku(line.key)}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {quickCreatedSku?.id === line.skuId ? (
                        <p className="mt-1 text-xs text-emerald-700" role="status">
                          商品「{quickCreatedSku.name}」已创建并选中
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        aria-label={`第 ${index + 1} 行存放位置`}
                        className="h-9"
                        value={line.locationId}
                        onChange={(event) =>
                          updateLine(line.key, { locationId: event.target.value })
                        }
                        disabled={Boolean(fixedLocationId)}
                        required
                      >
                        {!line.locationId ? <option value="">选择存放位置</option> : null}
                        {locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name} · {location.code}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        aria-label={`第 ${index + 1} 行库存跟踪方式`}
                        className="h-9"
                        value={line.trackingMode}
                        onChange={(event) =>
                          updateLine(line.key, {
                            trackingMode: event.target.value as OpeningStockTrackingMode,
                          })
                        }
                      >
                        <option value="LOT">按批次管理</option>
                        <option value="ITEM_UNIT">逐件管理</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`第 ${index + 1} 行期初数量`}
                        type="number"
                        min="0.0001"
                        step={line.trackingMode === "ITEM_UNIT" ? "1" : "0.0001"}
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`第 ${index + 1} 行期初单位成本`}
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.unitCost}
                        onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                        required
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        aria-label={`第 ${index + 1} 行成本币种`}
                        className="h-9"
                        value={line.currency}
                        onChange={(event) => updateLine(line.key, { currency: event.target.value })}
                      >
                        <option value="CNY">CNY</option>
                        <option value="JPY">JPY</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`第 ${index + 1} 行批次号`}
                        maxLength={100}
                        value={line.batchLabel}
                        onChange={(event) =>
                          updateLine(line.key, { batchLabel: event.target.value })
                        }
                        placeholder="留空则自动生成"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`第 ${index + 1} 行品相等级`}
                        value={line.conditionGrade}
                        onChange={(event) =>
                          updateLine(line.key, {
                            conditionGrade: event.target.value,
                          })
                        }
                        placeholder={line.trackingMode === "ITEM_UNIT" ? "例如 A" : "可选"}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        aria-label={`第 ${index + 1} 行备注`}
                        value={line.note}
                        onChange={(event) => updateLine(line.key, { note: event.target.value })}
                        placeholder="可选"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-red-600"
                        aria-label={`删除第 ${index + 1} 行`}
                        title="删除此行"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((item) => item.key !== line.key))
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {completeLines.length > 0
                ? `已填写 ${completeLines.length} 条明细 · ${skuCount} 个商品`
                : "尚未填写有效库存明细"}
              {totals.map(([currency, total]) => (
                <span key={currency} className="ml-3 tabular-nums">
                  库存金额 {currency} {total.value.toFixed(2)}
                </span>
              ))}
            </p>
            {firstIncompleteLine >= 0 ? (
              <p className="mt-1 text-xs text-red-600" role="status">
                请补全第 {firstIncompleteLine + 1} 行的商品、存放位置、数量和单位成本。
              </p>
            ) : null}
            <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              确认后将立即生成库存、库存流水和审计记录；生效数据不能直接编辑或删除。
            </p>
            {error ? (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(safeReturnTo ?? "/inventory/opening-stock")}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? "正在生成…" : "确认并生成库存"}
            </Button>
          </div>
        </section>

        <ActionDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="确认生成期初库存？"
          description="请核对生效日期、商品、位置、数量和成本。"
          size="sm"
          closeDisabled={loading}
        >
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">生效日期</dt>
                <dd className="mt-1 font-medium">{openingAt}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">库存明细</dt>
                <dd className="mt-1 font-medium">{completeLines.length} 条</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">商品</dt>
                <dd className="mt-1 font-medium">{skuCount} 个</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">存放位置</dt>
                <dd className="mt-1 font-medium">{locationCount} 个</dd>
              </div>
            </dl>
            <div className="space-y-1 text-sm">
              {totals.map(([currency, total]) => (
                <p key={currency} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">库存金额（{currency}）</span>
                  <span className="font-medium tabular-nums">{total.value.toFixed(2)}</span>
                </p>
              ))}
            </div>
            <p className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              生成后会立即增加库存。如需更正，应通过库存调整保留完整记录。
            </p>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={loading}
              >
                返回检查
              </Button>
              <Button type="button" onClick={confirmSubmit} disabled={loading}>
                {loading ? "正在生成…" : "确认生成"}
              </Button>
            </div>
          </div>
        </ActionDialog>
      </form>

      <ActionDialog
        open={quickSkuOpen}
        onOpenChange={setQuickSkuOpen}
        title="新建可入库商品"
        description="适合没有规格拆分的商品；创建后会直接选入当前库存明细。"
        size="sm"
        closeDisabled={quickSkuLoading}
      >
        <div
          className="space-y-4"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement &&
              !quickSkuLoading
            ) {
              event.preventDefault();
              void createQuickSku();
            }
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="quick-opening-sku-name">商品名称 *</Label>
            <Input
              id="quick-opening-sku-name"
              value={quickSkuName}
              onChange={(event) => {
                setQuickSkuName(event.target.value);
                setQuickSkuError(null);
              }}
              placeholder="例如：无线机械键盘"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quick-opening-sku-code">SKU 编码</Label>
            <Input
              id="quick-opening-sku-code"
              value={quickSkuCode}
              onChange={(event) => {
                setQuickSkuCode(event.target.value.toUpperCase());
                setQuickSkuError(null);
              }}
              placeholder="留空则自动生成"
              autoComplete="off"
            />
          </div>
          {quickSkuError ? (
            <p role="alert" className="text-sm text-red-600">
              {quickSkuError}
            </p>
          ) : null}
          <div className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            如果商品有尺码、颜色等多个规格，请使用完整商品创建流程；当前已填写的库存内容会自动恢复。
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button asChild variant="ghost">
              <Link
                href={`/inventory/skus/new?${new URLSearchParams({
                  returnTo: skuCreateReturnTo ?? returnTo,
                }).toString()}`}
                onClick={saveDraftForProductCreation}
              >
                创建多规格商品
              </Link>
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setQuickSkuOpen(false)}
                disabled={quickSkuLoading}
              >
                取消
              </Button>
              <Button type="button" onClick={createQuickSku} disabled={quickSkuLoading}>
                {quickSkuLoading ? "正在创建…" : "创建并选用"}
              </Button>
            </div>
          </div>
        </div>
      </ActionDialog>
    </>
  );
}

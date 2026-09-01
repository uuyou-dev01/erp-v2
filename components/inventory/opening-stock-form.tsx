"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import {
  createOpeningStockAction,
  type OpeningStockTrackingMode,
} from "@/app/actions/opening-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  createdLocationId?: string;
  fixedLocationId?: string;
  returnTo?: string;
  locationCreateReturnTo?: string;
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

export function OpeningStockForm({
  storeId,
  defaultCurrency,
  defaultDate,
  skus,
  locations,
  presetSkuIds = [],
  createdLocationId,
  fixedLocationId,
  returnTo = "/inventory/opening-stock",
  locationCreateReturnTo,
}: OpeningStockFormProps) {
  const router = useRouter();
  const safeReturnTo = safeInternalReturnPath(returnTo);
  const defaultLocationId =
    locations.find((location) => location.id === fixedLocationId)?.id ??
    locations.find((location) => location.id === createdLocationId)?.id ??
    locations[0]?.id ??
    "";
  const validPresetIds = [
    ...new Set(presetSkuIds.filter((id) => skus.some((sku) => sku.id === id))),
  ];
  const [openingAt, setOpeningAt] = useState(defaultDate);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditableLine[]>(() =>
    validPresetIds.length > 0
      ? validPresetIds.map((skuId) =>
          makeLine(defaultCurrency, defaultLocationId, skuId, `initial-${skuId}`)
        )
      : [makeLine(defaultCurrency, defaultLocationId, "", "initial-empty")]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addedLineSequence = useRef(0);

  const addLine = () => {
    addedLineSequence.current += 1;
    const key = `added-${Date.now()}-${addedLineSequence.current}`;
    setLines((current) => [...current, makeLine(defaultCurrency, defaultLocationId, "", key)]);
  };

  const totals = useMemo(() => {
    const result = new Map<string, { quantity: number; value: number }>();
    for (const line of lines) {
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      const current = result.get(line.currency) ?? { quantity: 0, value: 0 };
      current.quantity += quantity;
      if (Number.isFinite(unitCost) && unitCost >= 0) {
        current.value += quantity * unitCost;
      }
      result.set(line.currency, current);
    }
    return Array.from(result.entries());
  }, [lines]);

  const updateLine = (key: string, patch: Partial<EditableLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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
      setError(submitError instanceof Error ? submitError.message : "确认失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  if (locations.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <p className="font-medium">需要先建立至少一个仓库或仓位</p>
        <p className="mt-1 text-amber-800">
          期初库存必须明确落在哪个位置，才能生成可追溯的库存流水。
        </p>
        <Link
          href={`/inventory/locations?${new URLSearchParams({
            create: "1",
            returnTo: locationCreateReturnTo ?? returnTo,
          }).toString()}`}
        >
          <Button className="mt-4" size="sm">
            新建仓库位置
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="rounded-lg border bg-background">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">开账信息</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            记录启用系统时已经真实存在的库存，不替代采购入库。
          </p>
        </div>
        <div className="grid gap-4 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-1.5">
            <Label htmlFor="opening-stock-date">期初日期 *</Label>
            <Input
              id="opening-stock-date"
              type="date"
              value={openingAt}
              onChange={(event) => setOpeningAt(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening-stock-note">单据备注</Label>
            <Textarea
              id="opening-stock-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="例如：2026 年 7 月系统上线初盘"
            />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">库存明细</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              每一行形成一个独立批次；同一商品存在不同进价时，请按批次拆行录入。
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
                <th className="w-[250px] px-3 py-2 font-medium">商品 *</th>
                <th className="w-[170px] px-3 py-2 font-medium">仓库 *</th>
                <th className="w-[125px] px-3 py-2 font-medium">管理方式</th>
                <th className="w-[105px] px-3 py-2 font-medium">数量 *</th>
                <th className="w-[125px] px-3 py-2 font-medium">单位成本 *</th>
                <th className="w-[95px] px-3 py-2 font-medium">币种</th>
                <th className="w-[150px] px-3 py-2 font-medium">批次标识</th>
                <th className="w-[130px] px-3 py-2 font-medium">默认品相</th>
                <th className="min-w-[160px] px-3 py-2 font-medium">行备注</th>
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
                    <Select
                      id={`opening-sku-${line.key}`}
                      className="h-9"
                      value={line.skuId}
                      onChange={(event) => updateLine(line.key, { skuId: event.target.value })}
                      required
                    >
                      <option value="">选择商品</option>
                      {skus.map((sku) => (
                        <option key={sku.id} value={sku.id}>
                          {sku.parentName && !sku.name.startsWith(sku.parentName)
                            ? `${sku.parentName} · `
                            : ""}
                          {sku.name} · {sku.code}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`第 ${index + 1} 行仓库`}
                      className="h-9"
                      value={line.locationId}
                      onChange={(event) => updateLine(line.key, { locationId: event.target.value })}
                      disabled={Boolean(fixedLocationId)}
                      required
                    >
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name} · {location.code}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`第 ${index + 1} 行管理方式`}
                      className="h-9"
                      value={line.trackingMode}
                      onChange={(event) =>
                        updateLine(line.key, {
                          trackingMode: event.target.value as OpeningStockTrackingMode,
                        })
                      }
                    >
                      <option value="LOT">按批次数量</option>
                      <option value="ITEM_UNIT">逐件管理</option>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`第 ${index + 1} 行数量`}
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
                      aria-label={`第 ${index + 1} 行单位成本`}
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
                      aria-label={`第 ${index + 1} 行币种`}
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
                      aria-label={`第 ${index + 1} 行批次标识`}
                      maxLength={100}
                      value={line.batchLabel}
                      onChange={(event) => updateLine(line.key, { batchLabel: event.target.value })}
                      placeholder="留空则自动生成"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      aria-label={`第 ${index + 1} 行默认品相`}
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
            {lines.length} 个批次
            {totals.map(([currency, total]) => (
              <span key={currency} className="ml-3 tabular-nums">
                {currency} {total.value.toFixed(2)} / 数量 {total.quantity}
              </span>
            ))}
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            确认后将立即生成库存批次或单件、库存流水和审计记录。
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
          <Button type="submit" disabled={loading || skus.length === 0}>
            {loading ? "正在确认…" : "确认开账"}
          </Button>
        </div>
      </section>
    </form>
  );
}

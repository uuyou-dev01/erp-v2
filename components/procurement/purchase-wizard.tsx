"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Stepper } from "@/components/shared/stepper";
import { CSVImportDialog } from "@/components/shared/csv-import-dialog";
import { createPurchaseOrder, addPurchaseLine } from "@/app/actions/purchase-orders";
import { createSKU, getSKUs } from "@/app/actions/skus";
import { getLocations } from "@/app/actions/locations";
import { isValidDecimal, formatCurrency } from "@/lib/decimal";
import { t, CURRENCIES } from "@/lib/i18n";
import { AlertCircle, Plus, Trash2, Upload, ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import Decimal from "decimal.js";

interface PurchaseWizardProps {
  storeId: string;
}

interface LineItem {
  id: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  quantity: string;
  unitPrice: string;
}

interface SKUOption {
  id: string;
  code: string;
  name: string;
  parentSkuId?: string | null;
  parentSku?: { id: string; code: string; name: string } | null;
  childSkus?: { id: string }[];
}

interface GroupedSKU {
  parent: SKUOption | null;
  children: SKUOption[];
}

const WIZARD_STEPS = [
  { label: "基本信息", description: "订单和供应商信息" },
  { label: "添加商品", description: "采购商品明细" },
  { label: "确认提交", description: "预览并提交" },
];

function generateOrderNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `PO-${y}${m}${d}-${rand}`;
}

function generateLineId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function PurchaseWizard({ storeId }: PurchaseWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [skus, setSKUs] = useState<SKUOption[]>([]);
  const [locations, setLocations] = useState<Array<{ id: string; code: string; name: string }>>([]);

  // Step 1 — basic info
  const [basicInfo, setBasicInfo] = useState({
    orderNo: generateOrderNo(),
    supplierName: "",
    currency: "CNY",
    fxRate: "",
    orderedAt: new Date().toISOString().split("T")[0],
    destinationLocationId: "",
  });
  const [basicErrors, setBasicErrors] = useState<Record<string, string>>({});

  // Step 2 — line items
  const [lines, setLines] = useState<LineItem[]>([]);
  const [newLine, setNewLine] = useState({ skuId: "", quantity: "", unitPrice: "" });
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [csvOpen, setCsvOpen] = useState(false);
  const [skuSearch, setSkuSearch] = useState("");
  const [skuCreateOpen, setSkuCreateOpen] = useState(false);
  const [creatingSku, setCreatingSku] = useState(false);
  const [quickSku, setQuickSku] = useState({
    code: "",
    name: "",
    category: "",
    brand: "",
    parentSkuId: "",
  });

  useEffect(() => {
    getSKUs(storeId).then(setSKUs);
    getLocations(storeId).then(setLocations);
  }, [storeId]);

  const selectedSku = useMemo(
    () => skus.find((sku) => sku.id === newLine.skuId),
    [skus, newLine.skuId]
  );

  const groupedSkus = useMemo(() => {
    const query = skuSearch.trim().toLowerCase();
    const matched = query
      ? skus.filter((sku) => [sku.code, sku.name].some((v) => v.toLowerCase().includes(query)))
      : skus;

    const matchedIds = new Set(matched.map((s) => s.id));

    const skuById = new Map(skus.map((s) => [s.id, s]));

    const groups: GroupedSKU[] = [];
    const placed = new Set<string>();

    for (const sku of matched) {
      if (placed.has(sku.id)) continue;

      if (sku.parentSkuId) {
        const parent = skuById.get(sku.parentSkuId);
        if (parent && !placed.has(parent.id)) {
          const siblings = skus.filter((s) => s.parentSkuId === parent.id && matchedIds.has(s.id));
          groups.push({ parent, children: siblings });
          placed.add(parent.id);
          siblings.forEach((s) => placed.add(s.id));
        } else if (!parent) {
          groups.push({ parent: null, children: [sku] });
          placed.add(sku.id);
        }
      } else {
        const children = skus.filter((s) => s.parentSkuId === sku.id && matchedIds.has(s.id));
        groups.push({ parent: sku, children });
        placed.add(sku.id);
        children.forEach((s) => placed.add(s.id));
      }
    }

    return groups.slice(0, 15);
  }, [skus, skuSearch]);

  // ---- Step 1 validation ----
  const validateStep1 = useCallback(() => {
    const errs: Record<string, string> = {};
    if (!basicInfo.orderNo.trim()) errs.orderNo = "采购单号为必填项";
    if (basicInfo.fxRate && !isValidDecimal(basicInfo.fxRate)) errs.fxRate = "汇率格式无效";
    if (!basicInfo.orderedAt) errs.orderedAt = "采购日期为必填项";
    setBasicErrors(errs);
    return Object.keys(errs).length === 0;
  }, [basicInfo]);

  // ---- Step 2 helpers ----
  const addLine = () => {
    const errs: Record<string, string> = {};
    if (!newLine.skuId) errs.skuId = "请选择SKU";
    if (!newLine.quantity || !isValidDecimal(newLine.quantity) || parseFloat(newLine.quantity) <= 0)
      errs.quantity = "请输入有效数量";
    if (
      !newLine.unitPrice ||
      !isValidDecimal(newLine.unitPrice) ||
      parseFloat(newLine.unitPrice) < 0
    )
      errs.unitPrice = "请输入有效单价";
    setLineErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const sku = skus.find((s) => s.id === newLine.skuId);
    if (!sku) return;

    setLines((prev) => [
      ...prev,
      {
        id: generateLineId(),
        skuId: sku.id,
        skuCode: sku.code,
        skuName: sku.name,
        quantity: newLine.quantity,
        unitPrice: newLine.unitPrice,
      },
    ]);
    setNewLine({ skuId: "", quantity: "", unitPrice: "" });
    setSkuSearch("");
    setLineErrors({});
  };

  const handleCreateSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSku.code.trim() || !quickSku.name.trim()) {
      alert("SKU代码和名称为必填项");
      return;
    }

    setCreatingSku(true);
    try {
      const sku = await createSKU({
        storeId,
        code: quickSku.code.trim().toUpperCase(),
        name: quickSku.name.trim(),
        parentSkuId: quickSku.parentSkuId || undefined,
        category: quickSku.category.trim() || undefined,
        brand: quickSku.brand.trim() || undefined,
      });
      const refreshed = await getSKUs(storeId);
      setSKUs(refreshed);
      setNewLine((prev) => ({ ...prev, skuId: sku.id }));
      setSkuSearch(`${sku.code} ${sku.name}`);
      setQuickSku({ code: "", name: "", category: "", brand: "", parentSkuId: "" });
      setSkuCreateOpen(false);
      setLineErrors((prev) => {
        const next = { ...prev };
        delete next.skuId;
        return next;
      });
    } catch (error) {
      console.error("Failed to create SKU:", error);
      alert(error instanceof Error ? error.message : "创建SKU失败，请重试");
    } finally {
      setCreatingSku(false);
    }
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.id !== id));

  const lineTotal = (l: LineItem) => new Decimal(l.quantity).times(new Decimal(l.unitPrice));
  const grandTotal = lines.reduce((s, l) => s.plus(lineTotal(l)), new Decimal(0));

  // CSV import handler
  const handleCSVImport = async (rows: Record<string, string>[]) => {
    let success = 0;
    let failed = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const skuCode = row.sku_code?.trim();
      const qty = row.quantity?.trim();
      const price = row.unit_price?.trim();

      if (!skuCode || !qty || !price) {
        failed++;
        errors.push({ row: i + 1, message: "SKU代码、数量、单价为必填项" });
        continue;
      }
      if (!isValidDecimal(qty) || parseFloat(qty) <= 0) {
        failed++;
        errors.push({ row: i + 1, message: "数量格式无效" });
        continue;
      }
      if (!isValidDecimal(price) || parseFloat(price) < 0) {
        failed++;
        errors.push({ row: i + 1, message: "单价格式无效" });
        continue;
      }

      const sku = skus.find((s) => s.code.toLowerCase() === skuCode.toLowerCase());
      if (!sku) {
        failed++;
        errors.push({ row: i + 1, message: `SKU代码 "${skuCode}" 不存在` });
        continue;
      }

      setLines((prev) => [
        ...prev,
        {
          id: generateLineId(),
          skuId: sku.id,
          skuCode: sku.code,
          skuName: sku.name,
          quantity: qty,
          unitPrice: price,
        },
      ]);
      success++;
    }
    return { success, failed, errors };
  };

  // ---- Navigation ----
  const goNext = () => {
    if (step === 0 && !validateStep1()) return;
    if (step === 1 && lines.length === 0) {
      setLineErrors({ global: "请至少添加一项商品" });
      return;
    }
    setStep((s) => Math.min(s + 1, 2));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  // ---- Submit ----
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const order = await createPurchaseOrder({
        storeId,
        orderNo: basicInfo.orderNo,
        supplierName: basicInfo.supplierName || undefined,
        currency: basicInfo.currency,
        fxRate: basicInfo.fxRate || undefined,
        orderedAt: new Date(basicInfo.orderedAt),
        destinationLocationId: basicInfo.destinationLocationId || undefined,
      });

      for (const line of lines) {
        await addPurchaseLine({
          purchaseOrderId: order.id,
          skuId: line.skuId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        });
      }

      router.push(`/procurement/${order.id}`);
      router.refresh();
    } catch (err) {
      console.error("Failed to create purchase order:", err);
      alert("创建采购订单失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render helpers ----
  const destLocation = locations.find((l) => l.id === basicInfo.destinationLocationId);

  return (
    <div className="space-y-6">
      <Stepper steps={WIZARD_STEPS} currentStep={step} />

      {/* ====== Step 1: Basic Info ====== */}
      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>采购订单信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orderNo">{t("purchase.order_no")} *</Label>
                <Input
                  id="orderNo"
                  value={basicInfo.orderNo}
                  onChange={(e) => setBasicInfo({ ...basicInfo, orderNo: e.target.value })}
                  placeholder="PO-YYYYMMDD-XXX"
                />
                {basicErrors.orderNo && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {basicErrors.orderNo}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplierName">{t("purchase.supplier")}</Label>
                <Input
                  id="supplierName"
                  value={basicInfo.supplierName}
                  onChange={(e) => setBasicInfo({ ...basicInfo, supplierName: e.target.value })}
                  placeholder={t("purchase.supplier_placeholder")}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currency">{t("purchase.currency")} *</Label>
                <Select
                  id="currency"
                  value={basicInfo.currency}
                  onChange={(e) => setBasicInfo({ ...basicInfo, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fxRate">{t("purchase.fx_rate")}</Label>
                <Input
                  id="fxRate"
                  value={basicInfo.fxRate}
                  onChange={(e) => setBasicInfo({ ...basicInfo, fxRate: e.target.value })}
                  placeholder={t("purchase.fx_rate_placeholder")}
                />
                {basicErrors.fxRate && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {basicErrors.fxRate}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="orderedAt">{t("purchase.order_date")} *</Label>
                <Input
                  id="orderedAt"
                  type="date"
                  value={basicInfo.orderedAt}
                  onChange={(e) => setBasicInfo({ ...basicInfo, orderedAt: e.target.value })}
                  required
                />
                {basicErrors.orderedAt && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {basicErrors.orderedAt}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="destinationLocationId">目的地仓库</Label>
                <Select
                  id="destinationLocationId"
                  value={basicInfo.destinationLocationId}
                  onChange={(e) =>
                    setBasicInfo({
                      ...basicInfo,
                      destinationLocationId: e.target.value,
                    })
                  }
                >
                  <option value="">（选填）请选择仓库</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.code} - {loc.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ====== Step 2: Add Lines ====== */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>采购商品</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                CSV 导入
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add line row */}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_auto] items-start">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>SKU *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-blue-600"
                    onClick={() => setSkuCreateOpen(true)}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    新建SKU
                  </Button>
                </div>
                <div className="rounded-lg border bg-white/50 p-2">
                  <Input
                    value={skuSearch}
                    onChange={(e) => {
                      setSkuSearch(e.target.value);
                      if (newLine.skuId) {
                        setNewLine({ ...newLine, skuId: "" });
                      }
                    }}
                    placeholder="输入SKU代码或商品名称搜索"
                  />
                  <div className="mt-2 max-h-56 overflow-auto rounded-md border bg-white">
                    {groupedSkus.length > 0 ? (
                      groupedSkus.map((group, gi) => {
                        const selectSku = (sku: SKUOption) => {
                          setNewLine({ ...newLine, skuId: sku.id });
                          setSkuSearch(`${sku.code} ${sku.name}`);
                          setLineErrors((prev) => {
                            const next = { ...prev };
                            delete next.skuId;
                            return next;
                          });
                        };

                        if (!group.parent) {
                          return group.children.map((sku) => {
                            const active = sku.id === newLine.skuId;
                            return (
                              <button
                                key={sku.id}
                                type="button"
                                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 ${active ? "bg-blue-50 text-blue-700" : ""}`}
                                onClick={() => selectSku(sku)}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-mono font-medium">
                                    {sku.code}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {sku.name}
                                  </span>
                                </span>
                                {active && <Check className="h-4 w-4 shrink-0" />}
                              </button>
                            );
                          });
                        }

                        const hasChildren = group.children.length > 0;
                        const parentActive = group.parent.id === newLine.skuId;

                        return (
                          <div key={group.parent.id} className={gi > 0 ? "border-t" : ""}>
                            <button
                              type="button"
                              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-blue-50 ${parentActive ? "bg-blue-50 text-blue-700" : ""}`}
                              onClick={() => selectSku(group.parent!)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate font-mono font-medium">
                                  {group.parent.code}
                                  {hasChildren && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                      ({group.children.length} 个子款)
                                    </span>
                                  )}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {group.parent.name}
                                </span>
                              </span>
                              {parentActive && <Check className="h-4 w-4 shrink-0" />}
                            </button>
                            {group.children.map((child) => {
                              const childActive = child.id === newLine.skuId;
                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  className={`flex w-full items-center justify-between gap-3 py-1.5 pl-7 pr-3 text-left text-sm hover:bg-blue-50 ${childActive ? "bg-blue-50 text-blue-700" : ""}`}
                                  onClick={() => selectSku(child)}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-mono text-xs">
                                      {child.code}
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {child.name}
                                    </span>
                                  </span>
                                  {childActive && <Check className="h-4 w-4 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                        没有找到SKU，可以直接新建
                      </div>
                    )}
                  </div>
                </div>
                {selectedSku && (
                  <p className="text-xs text-muted-foreground">
                    已选择：{selectedSku.code} - {selectedSku.name}
                  </p>
                )}
                {lineErrors.skuId && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {lineErrors.skuId}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t("common.quantity")} *</Label>
                <Input
                  value={newLine.quantity}
                  onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })}
                  placeholder="100"
                />
                {lineErrors.quantity && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {lineErrors.quantity}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>
                  {t("purchase.unit_price")} ({basicInfo.currency}) *
                </Label>
                <Input
                  value={newLine.unitPrice}
                  onChange={(e) => setNewLine({ ...newLine, unitPrice: e.target.value })}
                  placeholder="99.99"
                />
                {lineErrors.unitPrice && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3" />
                    {lineErrors.unitPrice}
                  </p>
                )}
              </div>

              <Button onClick={addLine} className="mt-8 shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                添加
              </Button>
            </div>

            {lineErrors.global && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {lineErrors.global}
              </p>
            )}

            {/* Lines table */}
            {lines.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">单价</TableHead>
                      <TableHead className="text-right">小计</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>
                          <p className="font-medium">{l.skuCode}</p>
                          <p className="text-xs text-muted-foreground">{l.skuName}</p>
                        </TableCell>
                        <TableCell className="text-right">{l.quantity}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(l.unitPrice, basicInfo.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(lineTotal(l).toFixed(2), basicInfo.currency)}
                        </TableCell>
                        <TableCell>
                          <button
                            onClick={() => removeLine(l.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3 bg-muted/30">
                  <span className="text-sm font-medium">合计</span>
                  <span className="text-lg font-bold">
                    {formatCurrency(grandTotal.toFixed(2), basicInfo.currency)}
                  </span>
                </div>
              </div>
            )}

            {lines.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                暂无商品，请添加采购行或通过 CSV 导入
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ====== Step 3: Confirm ====== */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>订单信息预览</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">采购单号</p>
                  <p className="font-medium">{basicInfo.orderNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">供应商</p>
                  <p className="font-medium">{basicInfo.supplierName || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">币种</p>
                  <p className="font-medium">
                    {CURRENCIES.find((c) => c.value === basicInfo.currency)?.label ??
                      basicInfo.currency}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">汇率</p>
                  <p className="font-medium">{basicInfo.fxRate || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">采购日期</p>
                  <p className="font-medium">{basicInfo.orderedAt}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">目的地仓库</p>
                  <p className="font-medium">
                    {destLocation ? `${destLocation.code} - ${destLocation.name}` : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>商品明细 ({lines.length} 项)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">单价</TableHead>
                    <TableHead className="text-right">小计</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <p className="font-medium">{l.skuCode}</p>
                        <p className="text-xs text-muted-foreground">{l.skuName}</p>
                      </TableCell>
                      <TableCell className="text-right">{l.quantity}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(l.unitPrice, basicInfo.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(lineTotal(l).toFixed(2), basicInfo.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-end gap-2 border-t px-4 py-3 mt-2">
                <span className="text-sm font-medium">总金额</span>
                <span className="text-xl font-bold text-brand-blue">
                  {formatCurrency(grandTotal.toFixed(2), basicInfo.currency)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ====== Nav buttons ====== */}
      <div className="flex items-center justify-between">
        <div>
          {step > 0 && (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              上一步
            </Button>
          )}
          {step === 0 && (
            <Button variant="outline" onClick={() => router.back()} disabled={submitting}>
              {t("common.cancel")}
            </Button>
          )}
        </div>
        <div>
          {step < 2 && (
            <Button onClick={goNext}>
              下一步
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {step === 2 && (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                "提交中..."
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  确认提交
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* CSV Import Dialog */}
      <CSVImportDialog
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        title="CSV 导入采购商品"
        targetFields={[
          { key: "sku_code", label: "SKU代码", required: true },
          { key: "quantity", label: "数量", required: true },
          { key: "unit_price", label: "单价", required: true },
        ]}
        onImport={handleCSVImport}
      />

      {skuCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !creatingSku && setSkuCreateOpen(false)}
          />
          <Card className="relative z-10 w-full max-w-xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>快速新建SKU</CardTitle>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setSkuCreateOpen(false)}
                  disabled={creatingSku}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSku} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="quickParentSku">关联父 SKU</Label>
                  <select
                    id="quickParentSku"
                    value={quickSku.parentSkuId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      const parent = skus.find((s) => s.id === pid);
                      if (parent) {
                        const childCount = skus.filter((s) => s.parentSkuId === pid).length;
                        const suffix = String(childCount + 1).padStart(2, "0");
                        setQuickSku({
                          ...quickSku,
                          parentSkuId: pid,
                          code: quickSku.code || `${parent.code}-${suffix}`,
                          category:
                            quickSku.category ||
                            (parent as SKUOption & { category?: string }).category ||
                            "",
                          brand:
                            quickSku.brand ||
                            (parent as SKUOption & { brand?: string }).brand ||
                            "",
                        });
                      } else {
                        setQuickSku({ ...quickSku, parentSkuId: "" });
                      }
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">独立 SKU / 父 SKU</option>
                    {skus
                      .filter((s) => !s.parentSkuId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quickSkuCode">SKU代码 *</Label>
                    <Input
                      id="quickSkuCode"
                      value={quickSku.code}
                      onChange={(e) =>
                        setQuickSku({ ...quickSku, code: e.target.value.toUpperCase() })
                      }
                      placeholder={
                        quickSku.parentSkuId ? "自动生成，可修改" : "例如：IPHONE15-CASE-CLEAR"
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quickSkuName">商品名称 *</Label>
                    <Input
                      id="quickSkuName"
                      value={quickSku.name}
                      onChange={(e) => setQuickSku({ ...quickSku, name: e.target.value })}
                      placeholder="例如：iPhone 15 透明手机壳"
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quickSkuCategory">分类</Label>
                    <Input
                      id="quickSkuCategory"
                      value={quickSku.category}
                      onChange={(e) => setQuickSku({ ...quickSku, category: e.target.value })}
                      placeholder="例如：手机配件"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quickSkuBrand">品牌</Label>
                    <Input
                      id="quickSkuBrand"
                      value={quickSku.brand}
                      onChange={(e) => setQuickSku({ ...quickSku, brand: e.target.value })}
                      placeholder="例如：Apple / 无品牌"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  这里只创建采购所需的最小SKU信息，图片和详细属性可后续在商品SKU页面补充。
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSkuCreateOpen(false)}
                    disabled={creatingSku}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={creatingSku}>
                    {creatingSku ? "创建中..." : "创建并选中"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

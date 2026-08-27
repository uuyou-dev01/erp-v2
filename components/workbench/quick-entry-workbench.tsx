"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  TableProperties,
  Trash2,
} from "lucide-react";
import {
  saveQuickEntryBatch,
  saveQuickEntryBatchGrouped,
  updateQuickEntry,
} from "@/app/actions/quick-entries";
import type { QuickEntryRowInput } from "@/lib/application/quick-entry";
import { isUsedCondition } from "@/lib/quick-entry-utils";
import { Badge } from "@/components/ui/badge";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  itemFunctionStatusOptions,
  itemRequiresIssueEvidence,
  normalizeItemConditionType,
  normalizeItemFunctionStatus,
  normalizeUsedItemGrade,
  usedItemGradeOptions,
  validateItemCondition,
} from "@/lib/inventory/item-condition";

type DraftRow = QuickEntryRowInput & {
  localId: string;
  result?: "success" | "failed";
  error?: string;
};

interface RecentEntry {
  id: string;
  rawBrand: string | null;
  rawProductName: string;
  rawVariant: string | null;
  conditionType: string | null;
  conditionGrade: string | null;
  functionStatus: string | null;
  purchasePrice: string | null;
  purchaseCurrency: string | null;
  purchaseDate: string | null;
  purchaseTrackingNo: string | null;
  transitTrackingNo: string | null;
  currentLocationText: string | null;
  listingPlatformsText: string | null;
  salePlatformText: string | null;
  salePrice: string | null;
  saleDate: string | null;
  batchNote: string | null;
  workflowStage: string;
  inspectionResult: string | null;
  processedStatus: string;
  errorMessage: string | null;
  generatedPurchaseOrderId: string | null;
  generatedLotId: string | null;
  generatedItemUnitIds: unknown;
  generatedListingIds: unknown;
  generatedCustomerOrderId: string | null;
  createdAt: string;
}

interface SuggestionLists {
  brand: string[];
  product: string[];
  variant: string[];
  purchasePlatform: string[];
  location: string[];
  listingPlatform: string[];
  salePlatform: string[];
  catalogProducts: Array<{
    id: string;
    name: string;
    brand: string | null;
    category: string | null;
    catalogRole: string;
  }>;
  catalogVariants: Array<{
    parentSkuId: string;
    label: string;
  }>;
}

interface QuickEntryWorkbenchProps {
  storeId: string;
  recentEntries: RecentEntry[];
  suggestions: SuggestionLists;
}

const CURRENCY_OPTIONS = ["CNY", "JPY", "USD", "HKD", "EUR", "GBP"];

const CONDITION_OPTIONS = [
  { value: "NEW", label: "全新" },
  { value: "USED", label: "中古 / 二手" },
];

const WORKFLOW_LABELS: Record<string, string> = {
  PURCHASE: "采购",
  LOGISTICS: "物流",
  INSPECTION: "到货处理",
  LISTING: "上架",
  SOLD: "已售",
  SHIPPED: "已发货",
  SETTLED: "已结算",
  CLOSED: "已关闭",
};

function createLocalId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isPositiveQuantity(value?: string | null) {
  const text = value?.trim();
  if (!text) return false;
  const quantity = Number(text);
  return Number.isFinite(quantity) && quantity > 0;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function serializedDateInputValue(value?: string | null) {
  if (!value) return "";
  const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (dateOnly) return dateOnly;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

const blankRow = (storeId: string): DraftRow => ({
  localId: createLocalId(),
  storeId,
  sourceType: "MANUAL",
  rawBrand: "",
  rawProductName: "",
  rawVariant: "",
  rawCategory: "",
  conditionType: "NEW",
  conditionGrade: undefined,
  functionStatus: "NORMAL",
  quantity: "1",
  purchasePrice: "",
  purchaseCurrency: "CNY",
  purchasePlatformText: "",
  purchaseDate: localDateInputValue(),
  currentLocationText: "",
  listingPlatformsText: "",
  note: "",
});

function splitPastedRows(text: string, storeId: string): DraftRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [
        brand,
        productName,
        variant,
        category,
        conditionType,
        purchasePrice,
        purchaseCurrency,
        purchasePlatform,
        purchaseDate,
        batchNote,
        listingPlatforms,
        purchaseTracking,
        purchaseShipping,
        location,
        transitTracking,
        transitShipping,
        statusCol,
        salePlatform,
        saleCurrency,
        saleTracking,
        salePrice,
        saleShipping,
        saleMisc,
        saleFee,
        saleDate,
      ] = line.split("\t").map((col) => col.trim());

      return {
        ...blankRow(storeId),
        sourceType: "PASTE",
        rawBrand: brand || "",
        rawProductName: productName || brand || "",
        rawVariant: variant || "",
        rawCategory: category || "",
        conditionType: normalizeItemConditionType(conditionType),
        conditionGrade:
          normalizeItemConditionType(conditionType) === "USED" ? "UNASSESSED" : undefined,
        functionStatus:
          normalizeItemConditionType(conditionType) === "USED" ? "UNTESTED" : "NORMAL",
        purchasePrice: purchasePrice || "",
        purchaseCurrency: purchaseCurrency || "CNY",
        purchasePlatformText: purchasePlatform || "",
        purchaseDate: purchaseDate || localDateInputValue(),
        batchNote: batchNote || "",
        listingPlatformsText: listingPlatforms || "",
        purchaseTrackingNo: purchaseTracking || "",
        purchaseShippingFee: purchaseShipping || "",
        currentLocationText: location || "",
        transitTrackingNo: transitTracking || "",
        transitShippingFee: transitShipping || "",
        salePlatformText: salePlatform || "",
        saleCurrency: saleCurrency || "",
        salePrice: salePrice || "",
        saleShippingFee: saleShipping || "",
        saleMiscFee: saleMisc || "",
        salePlatformFeeText: saleFee || "",
        saleDate: saleDate || "",
        note: statusCol || saleTracking || "",
      };
    })
    .filter((row) => row.rawProductName.trim());
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: "已完成", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    PARTIAL: { label: "待补全", className: "bg-amber-50 text-amber-700 border-amber-200" },
    FAILED: { label: "失败", className: "bg-red-50 text-red-700 border-red-200" },
    PENDING: { label: "待处理", className: "bg-slate-50 text-muted-foreground border-slate-200" },
    PROCESSING: { label: "处理中", className: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const item = map[status] ?? { label: status, className: "" };
  return (
    <Badge variant="outline" className={item.className}>
      {item.label}
    </Badge>
  );
}

function rowToPayload(row: DraftRow): QuickEntryRowInput {
  return {
    storeId: row.storeId,
    sourceType: row.sourceType,
    rawBrand: row.rawBrand,
    rawProductName: row.rawProductName,
    rawVariant: row.rawVariant,
    rawCategory: row.rawCategory,
    conditionType: row.conditionType,
    conditionGrade: row.conditionGrade,
    functionStatus: row.functionStatus,
    quantity: row.quantity,
    purchasePrice: row.purchasePrice,
    purchaseCurrency: row.purchaseCurrency,
    purchasePlatformText: row.purchasePlatformText,
    purchaseDate: row.purchaseDate,
    purchaseTrackingNo: row.purchaseTrackingNo,
    purchaseShippingFee: row.purchaseShippingFee,
    currentLocationText: row.currentLocationText,
    transitTrackingNo: row.transitTrackingNo,
    transitShippingFee: row.transitShippingFee,
    listingPlatformsText: row.listingPlatformsText,
    salePlatformText: row.salePlatformText,
    saleCurrency: row.saleCurrency,
    salePrice: row.salePrice,
    saleShippingFee: row.saleShippingFee,
    saleMiscFee: row.saleMiscFee,
    salePlatformFeeText: row.salePlatformFeeText,
    saleDate: row.saleDate,
    note: row.note,
    batchNote: row.batchNote,
  };
}

function PendingEntryPanel({
  entry,
  storeId,
  onUpdated,
}: {
  entry: RecentEntry;
  storeId: string;
  onUpdated: (msg: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    purchaseDate: serializedDateInputValue(entry.purchaseDate) || localDateInputValue(),
    purchaseTrackingNo: entry.purchaseTrackingNo ?? "",
    transitTrackingNo: entry.transitTrackingNo ?? "",
    currentLocationText: entry.currentLocationText ?? "",
    listingPlatformsText: entry.listingPlatformsText ?? "",
    salePlatformText: entry.salePlatformText ?? "",
    salePrice: entry.salePrice ?? "",
    saleDate: serializedDateInputValue(entry.saleDate),
    batchNote: entry.batchNote ?? "",
    conditionType: normalizeItemConditionType(entry.conditionType) as string,
    conditionGrade: (normalizeUsedItemGrade(entry.conditionGrade) ?? "UNASSESSED") as string,
    functionStatus: normalizeItemFunctionStatus(
      entry.functionStatus,
      normalizeItemConditionType(entry.conditionType)
    ) as string,
  });

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateQuickEntry(entry.id, {
        storeId,
        rawProductName: entry.rawProductName,
        conditionType: form.conditionType,
        conditionGrade: form.conditionGrade,
        functionStatus: form.functionStatus,
        purchaseDate: form.purchaseDate,
        purchaseTrackingNo: form.purchaseTrackingNo || undefined,
        transitTrackingNo: form.transitTrackingNo || undefined,
        currentLocationText: form.currentLocationText || undefined,
        listingPlatformsText: form.listingPlatformsText || undefined,
        salePlatformText: form.salePlatformText || undefined,
        salePrice: form.salePrice || undefined,
        saleDate: form.saleDate || undefined,
        batchNote: form.batchNote || undefined,
      });
      if (result.success) {
        onUpdated("录入记录已更新并重新结构化");
        router.refresh();
      } else {
        onUpdated(result.error ?? "更新失败");
      }
    });
  };

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <p className="truncate font-medium">
            {entry.rawBrand ? `${entry.rawBrand} · ` : ""}
            {entry.rawProductName}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {WORKFLOW_LABELS[entry.workflowStage] ?? entry.workflowStage} ·{" "}
            {entry.rawVariant || "独立 SKU"} · {entry.purchaseCurrency || "CNY"}{" "}
            {entry.purchasePrice || "-"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {statusBadge(entry.processedStatus)}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {entry.errorMessage && <p className="mt-2 text-xs text-amber-700">{entry.errorMessage}</p>}

      {expanded && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">采购日期</label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                业务日期，可在采购单中继续修正
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">商品状态</label>
              <Select
                value={form.conditionType}
                onChange={(e) => {
                  const conditionType = e.target.value;
                  setForm({
                    ...form,
                    conditionType,
                    conditionGrade: conditionType === "USED" ? "UNASSESSED" : "",
                    functionStatus: conditionType === "USED" ? "UNTESTED" : "NORMAL",
                  });
                }}
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">所在地</label>
              <Input
                list="loc-list"
                value={form.currentLocationText}
                onChange={(e) => setForm({ ...form, currentLocationText: e.target.value })}
                placeholder="日本-杰西家"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">采购物流单号</label>
              <Input
                value={form.purchaseTrackingNo}
                onChange={(e) => setForm({ ...form, purchaseTrackingNo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">转运单号</label>
              <Input
                value={form.transitTrackingNo}
                onChange={(e) => setForm({ ...form, transitTrackingNo: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">上架平台</label>
              <Input
                list="listplat-list"
                value={form.listingPlatformsText}
                onChange={(e) => setForm({ ...form, listingPlatformsText: e.target.value })}
                placeholder="煤炉、雅虎"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">售出平台 / 价格</label>
              <div className="flex gap-1">
                <Input
                  list="saleplat-list"
                  value={form.salePlatformText}
                  onChange={(e) => setForm({ ...form, salePlatformText: e.target.value })}
                  placeholder="平台"
                  className="flex-1"
                />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.salePrice}
                  onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                  placeholder="价格"
                  className="w-24"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">售出日期</label>
              <Input
                type="date"
                value={form.saleDate}
                onChange={(e) => setForm({ ...form, saleDate: e.target.value })}
              />
            </div>
          </div>

          {isUsedCondition(form.conditionType) && (
            <div className="space-y-3 rounded-md border bg-background p-3">
              <div>
                <p className="text-xs font-medium">中古单件检查</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  选择品级和功能状态；待评级或未测试的单件会进入“待检查 / 补资料”。
                </p>
              </div>
              <GradeButtons
                value={form.conditionGrade}
                onChange={(conditionGrade) => setForm({ ...form, conditionGrade })}
              />
              <div>
                <label className="text-xs text-muted-foreground">功能状态</label>
                <Select
                  value={form.functionStatus}
                  onChange={(e) => setForm({ ...form, functionStatus: e.target.value })}
                >
                  {itemFunctionStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              <label className="text-xs text-muted-foreground">瑕疵、缺件或采购备注</label>
              <Textarea
                value={form.batchNote}
                onChange={(e) => setForm({ ...form, batchNote: e.target.value })}
                placeholder="例如：鞋面划痕、无原盒、配件缺失"
                className="min-h-16"
              />
              <p className="text-xs text-muted-foreground">
                C/D 级或功能异常必须填写说明，并在单件详情补充实物图片。
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
              保存并重新结构化
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function DatalistOptions({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((opt) => (
        <option key={opt} value={opt} />
      ))}
    </datalist>
  );
}

function GradeButtons({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {usedItemGradeOptions.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? "default" : "outline"}
          className="h-8 px-2 text-xs"
          title={option.description}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function QuickEntryWorkbench({
  storeId,
  recentEntries,
  suggestions,
}: QuickEntryWorkbenchProps) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[]>(() => [blankRow(storeId)]);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{ success: number; failed: number } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [isPending, startTransition] = useTransition();

  const validRows = useMemo(
    () => rows.filter((row) => row.result !== "success" && row.rawProductName.trim().length > 0),
    [rows]
  );

  const incompleteEntries = useMemo(
    () =>
      recentEntries.filter((entry) => {
        const hasOperationalObject = Boolean(
          entry.generatedPurchaseOrderId ||
          entry.generatedLotId ||
          entry.generatedItemUnitIds ||
          entry.generatedListingIds ||
          entry.generatedCustomerOrderId
        );
        return (
          entry.processedStatus === "FAILED" ||
          (!hasOperationalObject && ["PARTIAL", "PENDING"].includes(entry.processedStatus))
        );
      }),
    [recentEntries]
  );

  const updateRow = (localId: string, patch: Partial<DraftRow>) => {
    setRows((current) =>
      current.map((row) =>
        row.localId === localId ? { ...row, ...patch, result: undefined, error: undefined } : row
      )
    );
  };

  const removeRow = (localId: string) => {
    setRows((current) => {
      const nextRows = current.filter((row) => row.localId !== localId);
      return nextRows.length > 0 ? nextRows : [blankRow(storeId)];
    });
    setSelectedRowIds((current) => current.filter((id) => id !== localId));
  };

  const findCatalogProduct = (name: string) => {
    const normalizedName = name.trim().toLocaleLowerCase();
    if (!normalizedName) return null;
    return (
      suggestions.catalogProducts.find(
        (product) => product.name.trim().toLocaleLowerCase() === normalizedName
      ) ?? null
    );
  };

  const updateProductName = (row: DraftRow, value: string) => {
    const matched = findCatalogProduct(value);
    updateRow(row.localId, {
      rawProductName: value,
      rawBrand: row.rawBrand?.trim() ? row.rawBrand : matched?.brand || "",
      rawCategory: row.rawCategory?.trim() ? row.rawCategory : matched?.category || "",
    });
  };

  const variantSuggestionsFor = (row: DraftRow) => {
    const product = findCatalogProduct(row.rawProductName);
    if (!product) return [];

    return [
      ...new Set(
        suggestions.catalogVariants
          .filter((variant) => variant.parentSkuId === product.id)
          .map((variant) => variant.label)
      ),
    ];
  };

  const catalogOutcomeFor = (row: DraftRow) => {
    const product = findCatalogProduct(row.rawProductName);
    const hasVariant = Boolean(row.rawVariant?.trim());

    if (hasVariant) {
      if (product?.catalogRole === "GROUP") {
        const existingVariant = suggestions.catalogVariants.some(
          (variant) =>
            variant.parentSkuId === product.id &&
            variant.label.trim().toLocaleLowerCase() === row.rawVariant?.trim().toLocaleLowerCase()
        );
        return existingVariant ? "复用现有规格 SKU" : "在现有商品组下新增规格 SKU";
      }
      return "创建商品组 + 规格 SKU";
    }

    if (product?.catalogRole === "GROUP") return "该商品组需要填写具体规格";
    if (product?.catalogRole === "SIMPLE") return "复用现有独立 SKU";
    return "创建独立 SKU";
  };

  const toggleRowSelection = (localId: string, checked: boolean) => {
    setSelectedRowIds((current) =>
      checked ? [...new Set([...current, localId])] : current.filter((id) => id !== localId)
    );
  };

  const selectedValidRows = validRows.filter((row) => selectedRowIds.includes(row.localId));
  const allValidRowsSelected =
    validRows.length > 0 && selectedValidRows.length === validRows.length;
  const partlySelected = selectedValidRows.length > 0 && !allValidRowsSelected;

  const validateProductRows = (candidateRows: DraftRow[]) => {
    for (const row of candidateRows) {
      if (!row.purchaseDate) {
        return `「${row.rawProductName}」缺少采购日期`;
      }
      if (!isPositiveQuantity(row.quantity)) {
        return `「${row.rawProductName}」的数量必须是大于 0 的数字`;
      }
      const matchedProduct = findCatalogProduct(row.rawProductName);
      if (matchedProduct?.catalogRole === "GROUP" && !row.rawVariant?.trim()) {
        return `「${row.rawProductName}」按规格管理，请填写尺码、颜色或版本等具体规格`;
      }
      if (isUsedCondition(row.conditionType) && Number(row.quantity ?? "1") !== 1) {
        return `「${row.rawProductName}」为中古单件，请将每件商品拆成独立一行录入`;
      }
      const conditionError = validateItemCondition({
        conditionType: row.conditionType,
        conditionGrade: row.conditionGrade,
        functionStatus: row.functionStatus,
        notes: [row.batchNote, row.note].filter(Boolean).join(" / "),
      });
      if (conditionError) {
        return `「${row.rawProductName}」：${conditionError}`;
      }
    }
    return null;
  };

  const handlePasteImport = () => {
    const parsed = splitPastedRows(pasteText, storeId);
    if (parsed.length === 0) {
      setMessage("没有识别到可导入的行");
      return;
    }
    setRows(parsed);
    setPasteText("");
    setMessage(`已识别 ${parsed.length} 行，确认后可批量保存`);
  };

  const handleSubmit = () => {
    if (validRows.length === 0) {
      setMessage("请至少填写一个商品名");
      return;
    }

    const validationError = validateProductRows(validRows);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    startTransition(async () => {
      const payload = validRows.map(rowToPayload);
      const result = await saveQuickEntryBatch(payload);
      const resultByLocalId = new Map(
        result.results.map((item) => [validRows[item.index]?.localId, item] as const)
      );

      setMessage(result.failed > 0 ? `有 ${result.failed} 行保存失败，请修改后重试。` : null);
      if (result.success > 0) {
        setSaveSummary({ success: result.success, failed: result.failed });
      }
      setSelectedRowIds((current) =>
        current.filter((localId) => !resultByLocalId.get(localId)?.success)
      );
      setRows((current) => {
        const nextRows = current.flatMap((row) => {
          const item = resultByLocalId.get(row.localId);
          if (!item) return [row];
          if (item.success) return [];
          return [{ ...row, result: "failed" as const, error: item.error }];
        });
        return nextRows.length > 0 ? nextRows : [blankRow(storeId)];
      });
      router.refresh();
    });
  };

  const handleGroupedSubmit = () => {
    if (selectedValidRows.length < 2) {
      setMessage("请至少选择两条有效行来合并采购单");
      return;
    }

    const validationError = validateProductRows(selectedValidRows);
    if (validationError) {
      setMessage(validationError);
      return;
    }

    for (const row of selectedValidRows) {
      if (!row.purchasePrice || Number(row.purchasePrice) <= 0) {
        setMessage(`「${row.rawProductName}」缺少购入价，不能合并采购单`);
        return;
      }
    }

    const currency = selectedValidRows[0]?.purchaseCurrency?.trim() || "CNY";
    const supplier = selectedValidRows[0]?.purchasePlatformText?.trim() || "";
    const purchaseDate = selectedValidRows[0]?.purchaseDate || "";
    if (!supplier) {
      setMessage("要合并成一张采购单，请先为所选行填写相同的采购渠道 / 卖家");
      return;
    }
    const mismatch = selectedValidRows.find(
      (row) =>
        (row.purchaseCurrency?.trim() || "CNY") !== currency ||
        (row.purchasePlatformText?.trim() || "") !== supplier ||
        (row.purchaseDate || "") !== purchaseDate
    );
    if (mismatch) {
      setMessage("合并采购单要求采购日期、币种和供应商一致，请调整后再合并");
      return;
    }

    startTransition(async () => {
      const selectedIds = new Set(selectedValidRows.map((row) => row.localId));
      const selectedPayload = selectedValidRows.map(rowToPayload);
      const restRows = validRows.filter((row) => !selectedIds.has(row.localId));
      const restPayload = restRows.map(rowToPayload);
      const groupedResult = await saveQuickEntryBatchGrouped(selectedPayload);
      const restResult = restPayload.length ? await saveQuickEntryBatch(restPayload) : null;

      const resultByLocalId = new Map<string, { success: boolean; error?: string }>();
      groupedResult.results.forEach((item) => {
        const row = selectedValidRows[item.index];
        if (row) resultByLocalId.set(row.localId, item);
      });
      restResult?.results.forEach((item) => {
        const row = restRows[item.index];
        if (row) resultByLocalId.set(row.localId, item);
      });

      const success = groupedResult.success + (restResult?.success ?? 0);
      const failed = groupedResult.failed + (restResult?.failed ?? 0);
      setMessage(failed > 0 ? `有 ${failed} 行保存失败，请修改后重试。` : null);
      if (success > 0) {
        setSaveSummary({ success, failed });
      }
      setSelectedRowIds((current) =>
        current.filter((localId) => !resultByLocalId.get(localId)?.success)
      );
      setRows((current) => {
        const nextRows = current.flatMap((row) => {
          const item = resultByLocalId.get(row.localId);
          if (!item) return [row];
          if (item.success) return [];
          return [{ ...row, result: "failed" as const, error: item.error }];
        });
        return nextRows.length > 0 ? nextRows : [blankRow(storeId)];
      });
      router.refresh();
    });
  };

  return (
    <div className="grid gap-5">
      <DatalistOptions id="brand-list" options={suggestions.brand} />
      <DatalistOptions id="product-list" options={suggestions.product} />
      <DatalistOptions id="pplat-list" options={suggestions.purchasePlatform} />
      <DatalistOptions id="loc-list" options={suggestions.location} />
      <DatalistOptions id="listplat-list" options={suggestions.listingPlatform} />
      <DatalistOptions id="saleplat-list" options={suggestions.salePlatform} />
      {rows.map((row) => (
        <DatalistOptions
          key={`variant-options-${row.localId}`}
          id={`variant-list-${row.localId}`}
          options={variantSuggestionsFor(row)}
        />
      ))}
      <section className="space-y-4">
        <div className="rounded-lg border bg-card p-3 sm:p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">快速录入表</h2>
              <p className="text-sm text-muted-foreground">
                先记录采购事实；保存后进入待补物流。需要补充上架或售出信息时可展开高级字段。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAdvancedFields((value) => !value)}
              >
                {showAdvancedFields ? "收起更多字段" : "更多业务字段"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRows((c) => [...c, blankRow(storeId)])}
              >
                <Plus className="mr-2 h-4 w-4" />
                新增行
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleGroupedSubmit}
                disabled={isPending || selectedValidRows.length < 2}
              >
                合并保存为 1 张采购单
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                {isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                保存并处理
              </Button>
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {message}
            </div>
          )}

          {selectedValidRows.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-l-2 border-primary bg-primary/5 px-3 py-2">
              <p className="text-sm font-medium">已选择 {selectedValidRows.length} 行采购明细</p>
              <p className="text-xs text-muted-foreground">
                同一采购渠道 / 卖家、同一币种的明细可保存到 1 张采购单，后续只产生 1
                个待补物流任务。
              </p>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border bg-muted/20 p-1">
            <table
              className={`w-full border-separate border-spacing-y-1 text-xs ${
                showAdvancedFields ? "min-w-[2020px]" : "min-w-[1460px]"
              }`}
            >
              <thead>
                <tr className="text-left text-[11px] text-muted-foreground">
                  <th className="sticky left-0 z-20 w-10 bg-muted/90 px-2 py-1.5 backdrop-blur">
                    <div className="flex justify-center">
                      <Checkbox
                        ref={(node) => {
                          if (node) node.indeterminate = partlySelected;
                        }}
                        checked={allValidRowsSelected}
                        disabled={validRows.length === 0}
                        onChange={(event) =>
                          setSelectedRowIds(
                            event.target.checked ? validRows.map((row) => row.localId) : []
                          )
                        }
                        aria-label="选择全部有效录入行"
                        title="全选当前有效录入行"
                        className="cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="w-28 whitespace-nowrap px-2">品牌</th>
                  <th className="w-52 whitespace-nowrap px-2">商品组 / 商品名</th>
                  <th className="w-52 whitespace-nowrap px-2">具体规格</th>
                  <th className="w-52 whitespace-nowrap px-2">商品状态 / 品级</th>
                  <th className="w-20 whitespace-nowrap px-2">数量</th>
                  <th className="w-28 whitespace-nowrap px-2">购入价</th>
                  <th className="w-24 whitespace-nowrap px-2">币种</th>
                  <th className="w-44 whitespace-nowrap px-2">采购渠道 / 卖家</th>
                  <th className="w-36 whitespace-nowrap px-2">采购日期</th>
                  <th className="w-48 whitespace-nowrap px-2">品相 / 采购备注</th>
                  {showAdvancedFields && (
                    <>
                      <th className="w-44 whitespace-nowrap px-2">采购物流单号</th>
                      <th className="w-36 whitespace-nowrap px-2">所在地</th>
                      <th className="w-36 whitespace-nowrap px-2">上架平台</th>
                      <th className="w-36 whitespace-nowrap px-2">售出平台</th>
                      <th className="w-28 whitespace-nowrap px-2">售出价</th>
                      <th className="w-36 whitespace-nowrap px-2">售出日期</th>
                    </>
                  )}
                  <th className="w-24 whitespace-nowrap px-2">处理状态</th>
                  <th className="sticky right-0 z-20 w-12 bg-muted/90 px-2 text-center backdrop-blur">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="[&_td]:bg-card [&_tr:hover_td]:bg-muted/40">
                {rows.map((row) => (
                  <tr key={row.localId} className="group align-top">
                    <td className="sticky left-0 z-10 p-2 shadow-[1px_0_0_0_hsl(var(--border))]">
                      <div className="flex h-8 items-center justify-center">
                        <Checkbox
                          checked={selectedRowIds.includes(row.localId)}
                          onChange={(event) =>
                            toggleRowSelection(row.localId, event.target.checked)
                          }
                          aria-label={`选择 ${row.rawProductName || "录入行"}`}
                          className="cursor-pointer"
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <Input
                        list="brand-list"
                        value={row.rawBrand ?? ""}
                        onChange={(e) => updateRow(row.localId, { rawBrand: e.target.value })}
                        placeholder="POP MART"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        list="product-list"
                        value={row.rawProductName}
                        onChange={(e) => updateProductName(row, e.target.value)}
                        placeholder="例如：Dunk SB Low 芝加哥"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        list={`variant-list-${row.localId}`}
                        value={row.rawVariant ?? ""}
                        onChange={(e) => updateRow(row.localId, { rawVariant: e.target.value })}
                        placeholder="例如：43码、红色；无规格可留空"
                        className="h-8 text-xs"
                      />
                      <p
                        className={`mt-1 line-clamp-2 max-w-52 text-[11px] leading-4 ${
                          catalogOutcomeFor(row).includes("需要填写")
                            ? "text-amber-700"
                            : "text-muted-foreground"
                        }`}
                      >
                        {catalogOutcomeFor(row)}
                      </p>
                    </td>
                    <td className="p-2">
                      <Select
                        value={normalizeItemConditionType(row.conditionType)}
                        onChange={(e) => {
                          const conditionType = e.target.value;
                          updateRow(row.localId, {
                            conditionType,
                            conditionGrade: conditionType === "USED" ? "UNASSESSED" : undefined,
                            functionStatus: conditionType === "USED" ? "UNTESTED" : "NORMAL",
                          });
                        }}
                        className="h-8 py-1 text-xs"
                      >
                        {CONDITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                      {isUsedCondition(row.conditionType) ? (
                        <div className="mt-2 w-48 space-y-2">
                          <GradeButtons
                            value={row.conditionGrade}
                            onChange={(conditionGrade) =>
                              updateRow(row.localId, { conditionGrade })
                            }
                          />
                          <Select
                            value={row.functionStatus ?? "UNTESTED"}
                            onChange={(e) =>
                              updateRow(row.localId, { functionStatus: e.target.value })
                            }
                            aria-label={`功能状态：${row.rawProductName || "录入行"}`}
                            className="h-8 py-1 text-xs"
                          >
                            {itemFunctionStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                功能：{option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.quantity ?? "1"}
                        onChange={(e) => updateRow(row.localId, { quantity: e.target.value })}
                        placeholder="1"
                        aria-label={`数量：${row.rawProductName || "录入行"}`}
                        className="h-8 px-2 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.purchasePrice ?? ""}
                        onChange={(e) => updateRow(row.localId, { purchasePrice: e.target.value })}
                        placeholder="53"
                        className="h-8 px-2 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Select
                        value={row.purchaseCurrency ?? "CNY"}
                        onChange={(e) =>
                          updateRow(row.localId, { purchaseCurrency: e.target.value })
                        }
                        className="h-8 py-1 text-xs"
                      >
                        {CURRENCY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="p-2">
                      <Input
                        list="pplat-list"
                        value={row.purchasePlatformText ?? ""}
                        onChange={(e) =>
                          updateRow(row.localId, { purchasePlatformText: e.target.value })
                        }
                        placeholder="例如：闲鱼、千岛、个人卖家"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="date"
                        value={row.purchaseDate ?? ""}
                        onChange={(e) => updateRow(row.localId, { purchaseDate: e.target.value })}
                        aria-label={`采购日期：${row.rawProductName || "录入行"}`}
                        className="h-8 px-2 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        value={row.batchNote ?? ""}
                        onChange={(e) => updateRow(row.localId, { batchNote: e.target.value })}
                        placeholder={
                          itemRequiresIssueEvidence(row)
                            ? "必填：瑕疵、异常、缺件等"
                            : "可选：批次或采购备注"
                        }
                        className="h-8 text-xs"
                      />
                    </td>
                    {showAdvancedFields && (
                      <>
                        <td className="p-2">
                          <Input
                            value={row.purchaseTrackingNo ?? ""}
                            onChange={(e) =>
                              updateRow(row.localId, { purchaseTrackingNo: e.target.value })
                            }
                            placeholder="保存后建议在工作台补"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            list="loc-list"
                            value={row.currentLocationText ?? ""}
                            onChange={(e) =>
                              updateRow(row.localId, { currentLocationText: e.target.value })
                            }
                            placeholder="所在地"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            list="listplat-list"
                            value={row.listingPlatformsText ?? ""}
                            onChange={(e) =>
                              updateRow(row.localId, { listingPlatformsText: e.target.value })
                            }
                            placeholder="煤炉、雅虎"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            list="saleplat-list"
                            value={row.salePlatformText ?? ""}
                            onChange={(e) =>
                              updateRow(row.localId, { salePlatformText: e.target.value })
                            }
                            placeholder="售出平台"
                            className="h-8 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={row.salePrice ?? ""}
                            onChange={(e) => updateRow(row.localId, { salePrice: e.target.value })}
                            placeholder="售出价"
                            className="h-8 px-2 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="date"
                            value={row.saleDate ?? ""}
                            onChange={(e) => updateRow(row.localId, { saleDate: e.target.value })}
                            aria-label={`售出日期：${row.rawProductName || "录入行"}`}
                            className="h-8 px-2 text-xs"
                          />
                        </td>
                      </>
                    )}
                    <td className="p-2 whitespace-nowrap">
                      {row.result === "success" ? (
                        <Badge className="bg-emerald-600">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          已保存
                        </Badge>
                      ) : row.result === "failed" ? (
                        <Badge variant="destructive">{row.error || "失败"}</Badge>
                      ) : (
                        <Badge variant="outline">未保存</Badge>
                      )}
                    </td>
                    <td className="sticky right-0 z-10 p-2 text-center shadow-[-1px_0_0_0_hsl(var(--border))]">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(row.localId)}
                        disabled={isPending}
                        aria-label={`删除 ${row.rawProductName || "录入行"}`}
                        title="删除此行"
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <TableProperties className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">从 Google Sheet 粘贴</h2>
          </div>
          <Textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="从表格复制多行后粘贴到这里；采购日期支持 YYYY-MM-DD，未填写时按本地今天"
            className="min-h-32"
          />
          <div className="mt-3 flex justify-end">
            <Button variant="outline" onClick={handlePasteImport}>
              解析为录入行
            </Button>
          </div>
        </div>
      </section>

      <aside className="grid items-start gap-4 lg:grid-cols-2">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">录入待补全</h2>
            <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </div>
          <div className="space-y-3">
            {incompleteEntries.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                暂无录入待补全记录
              </p>
            ) : (
              incompleteEntries.map((entry) => (
                <PendingEntryPanel
                  key={entry.id}
                  entry={entry}
                  storeId={storeId}
                  onUpdated={setMessage}
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">最近录入</h2>
          <div className="space-y-2">
            {recentEntries.slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-lg border px-3 py-2 text-sm">
                <p className="truncate font-medium">{entry.rawProductName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {WORKFLOW_LABELS[entry.workflowStage] ?? entry.workflowStage} · 采购{" "}
                  {serializedDateInputValue(entry.purchaseDate) || "未填写"}
                  {entry.saleDate ? ` · 售出 ${serializedDateInputValue(entry.saleDate)}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  录入于 {new Date(entry.createdAt).toLocaleString("zh-CN")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <ActionDialog
        open={saveSummary !== null}
        onOpenChange={(open) => {
          if (!open) setSaveSummary(null);
        }}
        title={saveSummary?.failed ? "部分保存成功" : "保存成功"}
        description="已保存的录入行已从表格中清除，不会在下次提交时重复保存。"
        size="sm"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">成功保存 {saveSummary?.success ?? 0} 行</p>
              {saveSummary?.failed ? (
                <p className="mt-1 text-sm text-amber-700">
                  另有 {saveSummary.failed} 行保存失败，已保留在录入表中供修改重试。
                </p>
              ) : (
                <p className="mt-1 text-sm text-emerald-700">可以继续录入下一批商品。</p>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setSaveSummary(null)}>
              知道了
            </Button>
          </div>
        </div>
      </ActionDialog>
    </div>
  );
}

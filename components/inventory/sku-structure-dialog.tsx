"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Layers3, Loader2, X } from "lucide-react";
import { convertSkuStructureAction } from "@/app/actions/skus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deriveCatalogRole } from "@/lib/application/sku-identity";

export interface SkuStructureTarget {
  id: string;
  code: string;
  name: string;
  catalogRole?: string | null;
  parentSkuId?: string | null;
  variantLabel?: string | null;
  childSkus?: Array<{ id: string; code: string; name: string }>;
}

function simpleToGroupDefaults(name: string) {
  const match = name.match(/^(.*?)(?:\s*[·・-]\s*|\s+)(\d+(?:\.\d+)?\s*(?:mm|cm|m|码|號|号|寸))$/i);
  if (!match) return { groupName: name.trim(), variantLabel: "标准款", axisName: "规格" };
  const variantLabel = match[2].replace(/\s+/g, "");
  return {
    groupName: match[1].trim(),
    variantLabel,
    axisName: /(?:mm|cm|m|寸)$/i.test(variantLabel) ? "尺寸" : "规格",
  };
}

export function SkuStructureDialog({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: SkuStructureTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const role = deriveCatalogRole({
    catalogRole: target.catalogRole,
    parentSkuId: target.parentSkuId,
    childCount: target.childSkus?.length ?? 0,
  });
  const defaults = useMemo(() => simpleToGroupDefaults(target.name), [target.name]);
  const [groupName, setGroupName] = useState(defaults.groupName);
  const [variantLabel, setVariantLabel] = useState(defaults.variantLabel);
  const [axisName, setAxisName] = useState(defaults.axisName);
  const [simpleName, setSimpleName] = useState(target.childSkus?.[0]?.name || target.name);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;
  const childCount = target.childSkus?.length ?? 0;
  const canCollapseGroup = role === "GROUP" && childCount <= 1;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result =
        role === "SIMPLE"
          ? await convertSkuStructureAction({
              skuId: target.id,
              mode: "SIMPLE_TO_GROUP",
              groupName,
              variantLabel,
              axisName,
            })
          : await convertSkuStructureAction({
              skuId: target.id,
              mode: "GROUP_TO_SIMPLE",
              simpleName,
            });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.push(
        `/inventory/skus/${result.mode === "SIMPLE_TO_GROUP" ? result.groupId : result.targetSkuId}`
      );
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭结构调整"
        className="absolute inset-0 bg-black/50"
        onClick={() => !pending && onClose()}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="sku-structure-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Layers3 className="h-4 w-4" />
            </span>
            <div>
              <h2 id="sku-structure-title" className="text-base font-semibold">
                调整商品结构
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {target.code} · {target.name}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={pending}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="space-y-5 px-5 py-5">
          {role === "SIMPLE" ? (
            <>
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-5 text-blue-900">
                系统会新建商品组，并把当前 <strong>{target.code}</strong> 保留为组内规格
                SKU。原有库存、采购、销售、图片和价格情报继续使用当前 SKU ID。
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="structure-group-name">商品组名称</Label>
                <Input
                  id="structure-group-name"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="structure-axis-name">规格维度</Label>
                  <Input
                    id="structure-axis-name"
                    value={axisName}
                    onChange={(event) => setAxisName(event.target.value)}
                    placeholder="例如：尺寸"
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="structure-variant-label">当前规格</Label>
                  <Input
                    id="structure-variant-label"
                    value={variantLabel}
                    onChange={(event) => setVariantLabel(event.target.value)}
                    placeholder="例如：6mm"
                    disabled={pending}
                  />
                </div>
              </div>
              <div className="rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                转换后：{groupName || "商品组"} → {variantLabel || "规格 SKU"}（{target.code}）
              </div>
            </>
          ) : role === "GROUP" ? (
            <>
              {canCollapseGroup ? (
                <>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
                    {childCount === 1
                      ? `系统将保留唯一规格 ${target.childSkus![0].code} 作为独立 SKU，原商品组停止使用。规格 SKU 的业务记录和 ID 不变。`
                      : "该商品组还没有规格，将直接转换为独立 SKU，并保留当前 ID。"}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="structure-simple-name">独立 SKU 名称</Label>
                    <Input
                      id="structure-simple-name"
                      value={simpleName}
                      onChange={(event) => setSimpleName(event.target.value)}
                      disabled={pending}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    该商品组包含 {childCount} 个规格
                    SKU，不能直接折叠。需要先合并或迁移规格，确保只剩一个要保留的 SKU。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
              规格 SKU 的结构由所属商品组管理，请从商品组页面调整。
            </div>
          )}
          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex justify-end gap-2 border-t bg-muted/15 px-5 py-3">
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            disabled={pending || role === "VARIANT" || (role === "GROUP" && !canCollapseGroup)}
            onClick={submit}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {role === "SIMPLE" ? "确认转为商品组" : "确认转为独立 SKU"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

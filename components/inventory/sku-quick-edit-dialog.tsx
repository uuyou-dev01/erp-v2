"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { updateSkuQuickInfoAction } from "@/app/actions/skus";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductCategoryPicker } from "@/components/inventory/product-category-picker";
import { ArrowUpRight, Loader2, Pencil, X } from "lucide-react";

export interface SkuQuickEditTarget {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  categoryId?: string | null;
  category: string | null;
}

interface SkuQuickEditDialogProps {
  open: boolean;
  onClose: () => void;
  sku: SkuQuickEditTarget;
  targetLabel: "商品组" | "SKU";
  categoryOptions?: string[];
  hasVariants?: boolean;
  fullDetailHref?: string;
}

export function SkuQuickEditDialog({
  open,
  onClose,
  sku,
  targetLabel,
  categoryOptions: _categoryOptions = [],
  hasVariants = false,
  fullDetailHref,
}: SkuQuickEditDialogProps) {
  const router = useRouter();
  const categoryListId = useId();
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState(sku.name);
  const [brand, setBrand] = useState(sku.brand ?? "");
  const [categoryId, setCategoryId] = useState(sku.categoryId ?? "");
  const [category, setCategory] = useState(sku.category ?? "");
  const [syncMissingVariantInfo, setSyncMissingVariantInfo] = useState(hasVariants);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setName(sku.name);
    setBrand(sku.brand ?? "");
    setCategoryId(sku.categoryId ?? "");
    setCategory(sku.category ?? "");
    setSyncMissingVariantInfo(hasVariants);
    setError(null);
  }, [hasVariants, open, sku]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open, submitting]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("请填写商品名称");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await updateSkuQuickInfoAction({
        id: sku.id,
        name,
        brand,
        categoryId: categoryId || null,
        category,
        syncMissingVariantInfo: hasVariants && syncMissingVariantInfo,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="关闭编辑弹窗"
        className="absolute inset-0 bg-black/50"
        onClick={() => {
          if (!submitting) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sku-quick-edit-title"
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Pencil className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="sku-quick-edit-title" className="text-base font-semibold">
                编辑{targetLabel}信息
              </h2>
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {sku.code || "未设置货号"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onClose}
            disabled={submitting}
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-5 py-5">
            <div className="space-y-1.5">
              <Label htmlFor={`${categoryListId}-name`}>商品名称</Label>
              <Input
                id={`${categoryListId}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={submitting}
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${categoryListId}-brand`}>品牌</Label>
                <Input
                  id={`${categoryListId}-brand`}
                  value={brand}
                  onChange={(event) => setBrand(event.target.value)}
                  disabled={submitting}
                  placeholder="例如 POP MART"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${categoryListId}-category`}>商品品类</Label>
                  {!sku.category ? (
                    <span className="text-[10px] font-medium text-amber-700">当前未填写</span>
                  ) : null}
                </div>
                <ProductCategoryPicker
                  value={categoryId}
                  legacyValue={category}
                  onChange={(nextCategoryId, nextCategoryName) => {
                    setCategoryId(nextCategoryId ?? "");
                    setCategory(nextCategoryName);
                  }}
                  disabled={submitting}
                  placeholder="例如 玩具、鞋服"
                />
              </div>
            </div>

            {hasVariants ? (
              <div className="rounded-lg border bg-muted/25 p-3">
                <Checkbox
                  id={`${categoryListId}-sync`}
                  checked={syncMissingVariantInfo}
                  onChange={(event) => setSyncMissingVariantInfo(event.target.checked)}
                  disabled={submitting}
                  label="同步补充到尚未填写品牌或品类的规格 SKU"
                />
                <p className="mt-1.5 pl-6 text-[11px] leading-5 text-muted-foreground">
                  只补空白字段，不覆盖规格 SKU 已有的信息。
                </p>
              </div>
            ) : null}

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}

            <p className="text-[11px] leading-5 text-muted-foreground">
              此处只更新商品主档，不会修改库存数量、上架记录或 SKU 编码。
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 border-t bg-muted/15 px-5 py-3">
            {fullDetailHref ? (
              <Link
                href={fullDetailHref}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                完整档案
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={onClose}
                disabled={submitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                className="h-8 min-w-20 text-xs"
                disabled={submitting}
              >
                {submitting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                保存
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

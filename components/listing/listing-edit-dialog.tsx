"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertCircle, Pencil, X } from "lucide-react";
import { updateListingAction } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/i18n";

interface ListingEditDialogProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  productLabel: string;
  platformName: string;
  listedPrice: string;
  currency: string;
  listedAt: string;
  status: string;
}

function listingDateValue(value: string) {
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
}

export function ListingEditDialog({
  open,
  onClose,
  listingId,
  productLabel,
  platformName,
  listedPrice,
  currency,
  listedAt,
  status,
}: ListingEditDialogProps) {
  const router = useRouter();
  const formId = useId();
  const [mounted, setMounted] = useState(false);
  const [price, setPrice] = useState(listedPrice);
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [date, setDate] = useState(() => listingDateValue(listedAt));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setPrice(listedPrice);
    setSelectedCurrency(currency);
    setDate(listingDateValue(listedAt));
    setError(null);
  }, [open, listedPrice, currency, listedAt]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open, saving]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const result = await updateListingAction(listingId, {
        listedPrice: price || undefined,
        currency: selectedCurrency,
        listedAt: date === listingDateValue(listedAt) ? undefined : date,
        status,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "更新 Listing 失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="关闭修改弹窗"
        className="absolute inset-0 bg-black/50"
        disabled={saving}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="relative z-10 w-full max-w-md rounded-2xl border bg-card shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id={`${formId}-title`} className="flex items-center gap-2 text-base font-semibold">
              <Pencil className="h-4 w-4 text-primary" aria-hidden="true" />
              修改上架信息
            </h2>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {platformName} · {productLabel}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            disabled={saving}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-price`}>平台售价</Label>
              <Input
                id={`${formId}-price`}
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={price}
                required={Boolean(listedPrice)}
                onChange={(event) => {
                  setPrice(event.target.value);
                  setError(null);
                }}
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-currency`}>币种</Label>
              <Select
                id={`${formId}-currency`}
                value={selectedCurrency}
                required
                onChange={(event) => {
                  setSelectedCurrency(event.target.value);
                  setError(null);
                }}
                disabled={saving}
              >
                <option value="">请选择币种</option>
                {!CURRENCIES.some((option) => option.value === currency) && currency ? (
                  <option value={currency}>{currency}</option>
                ) : null}
                {CURRENCIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${formId}-listed-at`}>上架日期</Label>
              <Input
                id={`${formId}-listed-at`}
                type="date"
                value={date}
                required
                onChange={(event) => {
                  setDate(event.target.value);
                  setError(null);
                }}
                disabled={saving}
              />
            </div>
            {error ? (
              <p role="alert" className="flex gap-1.5 text-sm text-destructive sm:col-span-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "保存中…" : "保存修改"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export function ListingEditButton(props: Omit<ListingEditDialogProps, "open" | "onClose">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
        修改上架信息
      </Button>
      <ListingEditDialog {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

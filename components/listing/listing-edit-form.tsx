"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateListingAction } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

interface ListingEditFormProps {
  listingId: string;
  listedPrice: string;
  currency: string;
  status: string;
  returnHref?: string;
}

export function ListingEditForm({
  listingId,
  listedPrice,
  currency,
  status,
  returnHref = "/listing",
}: ListingEditFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    listedPrice,
    currency,
    status,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    setLoading(true);
    try {
      const result = await updateListingAction(listingId, {
        listedPrice: formData.listedPrice || undefined,
        currency: formData.currency || undefined,
        status: formData.status,
      });
      if (!result.success) {
        setSubmitError(result.error);
        return;
      }
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "更新 Listing 失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="listedPrice">Listing 价格</Label>
          <Input
            id="listedPrice"
            type="number"
            step="0.01"
            value={formData.listedPrice}
            onChange={(event) =>
              updateFormData({ listedPrice: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">货币</Label>
          <Select
            id="currency"
            value={formData.currency}
            onChange={(event) =>
              updateFormData({ currency: event.target.value })
            }
          >
            <option value="CNY">人民币 (CNY)</option>
            <option value="USD">美元 (USD)</option>
            <option value="JPY">日元 (JPY)</option>
            <option value="EUR">欧元 (EUR)</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">状态</Label>
        <Select
          id="status"
          value={formData.status}
          onChange={(event) =>
            updateFormData({ status: event.target.value })
          }
        >
          <option value="ACTIVE">在售中</option>
          <option value="DELISTED">已下架</option>
          <option value="SOLD_OUT">已售罄</option>
        </Select>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "保存中..." : "保存修改"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={() => router.push(returnHref)}
        >
          返回
        </Button>
      </div>
    </form>
  );
}

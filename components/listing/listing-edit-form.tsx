"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateListing } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await updateListing(listingId, {
        listedPrice: formData.listedPrice || undefined,
        currency: formData.currency || undefined,
        status: formData.status,
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to update listing:", error);
      alert("更新 Listing 失败，请重试");
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
              setFormData({ ...formData, listedPrice: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">货币</Label>
          <Select
            id="currency"
            value={formData.currency}
            onChange={(event) =>
              setFormData({ ...formData, currency: event.target.value })
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
            setFormData({ ...formData, status: event.target.value })
          }
        >
          <option value="ACTIVE">在售中</option>
          <option value="DELISTED">已下架</option>
          <option value="SOLD_OUT">已售罄</option>
        </Select>
      </div>

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

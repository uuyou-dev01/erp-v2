"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createListing } from "@/app/actions/listings";
import { getPlatforms } from "@/app/actions/platforms";
import { getSKUs } from "@/app/actions/skus";
import { getItemUnits } from "@/app/actions/item-units";

interface ListingFormProps {
  storeId: string;
}

interface Platform {
  id: string;
  name: string;
}

interface SKU {
  id: string;
  code: string;
  name: string;
}

interface ItemUnit {
  id: string;
  status: string;
  conditionGrade: string | null;
  sku: {
    code: string;
  };
}

export function ListingForm({ storeId }: ListingFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [skus, setSkus] = useState<SKU[]>([]);
  const [itemUnits, setItemUnits] = useState<ItemUnit[]>([]);
  const [formData, setFormData] = useState({
    platformId: "",
    listingType: "SKU" as "SKU" | "ITEM_UNIT",
    skuId: "",
    itemUnitId: "",
    listedPrice: "",
    currency: "CNY",
  });

  useEffect(() => {
    const loadData = async () => {
      const [platformsData, skusData, itemUnitsData] = await Promise.all([
        getPlatforms(storeId),
        getSKUs(storeId),
        getItemUnits(storeId),
      ]);
      setPlatforms(platformsData);
      setSkus(skusData);
      setItemUnits(itemUnitsData.filter((item) => item.status === "AVAILABLE"));
    };
    loadData();
  }, [storeId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createListing({
        storeId,
        platformId: formData.platformId,
        listingType: formData.listingType,
        skuId: formData.listingType === "SKU" ? formData.skuId : undefined,
        itemUnitId:
          formData.listingType === "ITEM_UNIT" ? formData.itemUnitId : undefined,
        listedPrice: formData.listedPrice || undefined,
        currency: formData.currency || undefined,
      });

      router.push("/listing");
    } catch (error) {
      console.error("Failed to create listing:", error);
      alert("创建上架失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="platformId">销售平台</Label>
        <Select
          id="platformId"
          value={formData.platformId}
          onChange={(e) =>
            setFormData({ ...formData, platformId: e.target.value })
          }
          required
        >
          <option value="">选择平台</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </Select>
        {platforms.length === 0 && (
          <p className="text-xs text-muted-foreground">
            请先在&quot;管理平台&quot;中添加销售平台
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="listingType">上架类型</Label>
        <Select
          id="listingType"
          value={formData.listingType}
          onChange={(e) =>
            setFormData({
              ...formData,
              listingType: e.target.value as "SKU" | "ITEM_UNIT",
              skuId: "",
              itemUnitId: "",
            })
          }
        >
          <option value="SKU">SKU（批量商品）</option>
          <option value="ITEM_UNIT">单品（独立商品）</option>
        </Select>
      </div>

      {formData.listingType === "SKU" ? (
        <div className="space-y-2">
          <Label htmlFor="skuId">选择SKU</Label>
          <Select
            id="skuId"
            value={formData.skuId}
            onChange={(e) => setFormData({ ...formData, skuId: e.target.value })}
            required
          >
            <option value="">选择SKU</option>
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.code} - {sku.name}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="itemUnitId">选择单品</Label>
          <Select
            id="itemUnitId"
            value={formData.itemUnitId}
            onChange={(e) =>
              setFormData({ ...formData, itemUnitId: e.target.value })
            }
            required
          >
            <option value="">选择单品</option>
            {itemUnits.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku.code} - {item.conditionGrade || "未知成色"}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="listedPrice">上架价格</Label>
          <Input
            id="listedPrice"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={formData.listedPrice}
            onChange={(e) =>
              setFormData({ ...formData, listedPrice: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="currency">货币</Label>
          <Select
            id="currency"
            value={formData.currency}
            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
          >
            <option value="CNY">人民币 (CNY)</option>
            <option value="USD">美元 (USD)</option>
            <option value="JPY">日元 (JPY)</option>
            <option value="EUR">欧元 (EUR)</option>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading || platforms.length === 0}>
          {loading ? "创建中..." : "创建上架"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          取消
        </Button>
      </div>
    </form>
  );
}


"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { allocateInventory } from "@/app/actions/customer-orders";
import { getInventoryLots, getAvailableQuantity } from "@/app/actions/inventory-lots";
import { isValidDecimal } from "@/lib/decimal";
import { formatCurrency, formatQuantity } from "@/lib/decimal";
import { AlertCircle, Package } from "lucide-react";

interface AllocateInventoryFormProps {
  orderLineId: string;
  skuId: string;
  skuCode: string;
  requiredQty: string;
  storeId: string;
}

export function AllocateInventoryForm({
  orderLineId,
  skuId,
  skuCode,
  requiredQty,
  storeId,
}: AllocateInventoryFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lots, setLots] = useState<
    Array<{
      id: string;
      location: { code: string; name: string };
      unitCost: { toString: () => string };
      costCurrency: string;
      status: string;
      receivedAt: Date;
    }>
  >([]);
  const [availableQty, setAvailableQty] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    lotId: "",
    quantity: requiredQty,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getInventoryLots(storeId).then((allLots) => {
      const skuLots = allLots.filter((lot) => lot.skuId === skuId && lot.status === "ACTIVE");
      setLots(skuLots);

      skuLots.forEach((lot) => {
        getAvailableQuantity(lot.id).then((qty) => {
          setAvailableQty((prev) => ({ ...prev, [lot.id]: qty }));
        });
      });
    });
  }, [storeId, skuId]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.lotId) newErrors.lotId = "请选择入库库存";
    if (!formData.quantity) {
      newErrors.quantity = "数量为必填项";
    } else if (!isValidDecimal(formData.quantity) || parseFloat(formData.quantity) <= 0) {
      newErrors.quantity = "数量格式无效";
    } else {
      const available = availableQty[formData.lotId];
      if (available && parseFloat(formData.quantity) > parseFloat(available)) {
        newErrors.quantity = `仅有 ${available} 可用`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      await allocateInventory({
        orderLineId,
        lotId: formData.lotId,
        quantity: formData.quantity,
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to allocate inventory:", error);
      alert("分配库存失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3 rounded-lg border border-primary/50 bg-primary/10 p-4">
        <Package className="h-5 w-5 text-primary" />
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-medium">分配库存给 SKU: {skuCode}</p>
          <p className="text-muted-foreground">
            需求数量: {formatQuantity(requiredQty)}
          </p>
        </div>
      </div>

      {lots.length === 0 ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">无可用库存</p>
          <p className="text-muted-foreground">
            该SKU没有可用的入库库存。请先进行收货。
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="lotId">选择入库库存 (FIFO) *</Label>
            <Select
              id="lotId"
              value={formData.lotId}
              onChange={(e) => setFormData({ ...formData, lotId: e.target.value })}
              required
            >
              <option value="">选择入库库存</option>
              {lots.map((lot) => {
                const available = availableQty[lot.id] || "...";
                return (
                  <option key={lot.id} value={lot.id}>
                    {lot.location.code} | 可用: {available} | 成本:{" "}
                    {formatCurrency(lot.unitCost.toString(), lot.costCurrency)} | 到货:{" "}
                    {new Date(lot.receivedAt).toLocaleDateString("zh-CN")}
                  </option>
                );
              })}
            </Select>
            {errors.lotId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />{errors.lotId}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              入库库存按到货日期排序（先进先出）
            </p>
          </div>

          {formData.lotId && availableQty[formData.lotId] && (
            <div className="rounded-lg border bg-muted p-3 text-sm">
              <p className="font-medium">已选入库库存详情：</p>
              <p className="text-muted-foreground">
                可用: {formatQuantity(availableQty[formData.lotId])} 单位
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="quantity">分配数量 *</Label>
            <Input
              id="quantity"
              type="text"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              placeholder="例如：10"
              required
            />
            {errors.quantity && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />{errors.quantity}
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "分配中..." : "确认分配库存"}
          </Button>
        </>
      )}
    </form>
  );
}

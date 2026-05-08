"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/shared/stepper";
import { batchCreateListings } from "@/app/actions/listings";
import { Layers, X, Check } from "lucide-react";

interface BatchListingDialogProps {
  storeId: string;
  platforms: Array<{ id: string; name: string; code: string }>;
  skus: Array<{ id: string; code: string; name: string }>;
}

const STEPS = [
  { label: "选择SKU", description: "勾选要上架的商品" },
  { label: "选择平台", description: "选择目标销售平台" },
  { label: "设置价格", description: "统一定价（选填）" },
  { label: "确认提交", description: "检查并提交" },
];

export function BatchListingDialog({ storeId, platforms, skus }: BatchListingDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [platformId, setPlatformId] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("CNY");

  const handleToggleSku = (skuId: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(skuId)) {
        next.delete(skuId);
      } else {
        next.add(skuId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedSkus.size === skus.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(skus.map((s) => s.id)));
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await batchCreateListings({
        storeId,
        platformId,
        skuIds: Array.from(selectedSkus),
        listedPrice: price || undefined,
        currency: currency || undefined,
      });
      handleClose();
      router.refresh();
    } catch (error) {
      console.error("Batch create failed:", error);
      alert("批量上架失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStep(0);
    setSelectedSkus(new Set());
    setPlatformId("");
    setPrice("");
    setCurrency("CNY");
  };

  const canProceed = () => {
    switch (step) {
      case 0: return selectedSkus.size > 0;
      case 1: return !!platformId;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  };

  const selectedPlatform = platforms.find((p) => p.id === platformId);
  const selectedSkuList = skus.filter((s) => selectedSkus.has(s.id));

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Layers className="mr-2 h-4 w-4" />
        批量上架
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <Card className="relative w-full max-w-2xl max-h-[85vh] overflow-auto z-10">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>批量上架</CardTitle>
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="pt-2">
            <Stepper steps={STEPS} currentStep={step} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 0: 选择 SKU */}
          {step === 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  已选择 {selectedSkus.size} / {skus.length} 个SKU
                </p>
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  {selectedSkus.size === skus.length ? "取消全选" : "全选"}
                </Button>
              </div>
              {skus.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无可用SKU，请先创建商品
                </p>
              ) : (
                <div className="max-h-[40vh] overflow-auto border rounded-lg divide-y">
                  {skus.map((sku) => {
                    const checked = selectedSkus.has(sku.id);
                    return (
                      <label
                        key={sku.id}
                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${checked ? "bg-brand-blue/5" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleSku(sku.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {sku.code}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {sku.name}
                          </p>
                        </div>
                        {checked && (
                          <Check className="h-4 w-4 text-brand-blue shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Step 1: 选择平台 */}
          {step === 1 && (
            <div className="space-y-3">
              <Label>目标销售平台</Label>
              {platforms.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  暂无可用平台，请先添加平台
                </p>
              ) : (
                <div className="grid gap-2">
                  {platforms.map((p) => (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${platformId === p.id ? "border-brand-blue bg-brand-blue/5" : ""}`}
                    >
                      <input
                        type="radio"
                        name="platform"
                        value={p.id}
                        checked={platformId === p.id}
                        onChange={() => setPlatformId(p.id)}
                        className="h-4 w-4"
                      />
                      <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {p.code}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2: 设置价格 */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                为所有选中的SKU设置统一价格，留空则不设置价格。
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="batchPrice">统一价格（选填）</Label>
                  <Input
                    id="batchPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="batchCurrency">货币</Label>
                  <Select
                    id="batchCurrency"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="CNY">人民币 (CNY)</option>
                    <option value="USD">美元 (USD)</option>
                    <option value="JPY">日元 (JPY)</option>
                    <option value="EUR">欧元 (EUR)</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: 确认 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">选中SKU</span>
                  <span className="font-medium">{selectedSkus.size} 个</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">目标平台</span>
                  <span className="font-medium">
                    {selectedPlatform?.name || "-"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">统一价格</span>
                  <span className="font-medium">
                    {price ? `${currency} ${parseFloat(price).toFixed(2)}` : "未设置"}
                  </span>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    将上架以下商品：
                  </p>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {selectedSkuList.map((sku) => (
                      <p key={sku.id} className="text-sm">
                        <span className="font-mono text-xs">{sku.code}</span>{" "}
                        <span className="text-muted-foreground">{sku.name}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 导航按钮 */}
          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => (step === 0 ? handleClose() : setStep(step - 1))}
              disabled={loading}
            >
              {step === 0 ? "取消" : "上一步"}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()}>
                下一步
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={loading}>
                {loading
                  ? "创建中..."
                  : `确认上架 (${selectedSkus.size} 个)`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

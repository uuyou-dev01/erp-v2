"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  getListingFifoShipFromLocation,
  quickSellListing,
} from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { StockLocationBreakdown } from "@/lib/application/inventory";
import { ShoppingCart, X } from "lucide-react";

interface QuickSellButtonProps {
  listingId: string;
  listingType: "SKU" | "ITEM_UNIT";
  status: string;
  productLabel: string;
  listedPrice?: string | null;
  currency?: string | null;
  platformName?: string | null;
  platformFeeRate?: string | null;
  defaultShippingFee?: string | null;
  /** 卡片行内紧凑样式 */
  compact?: boolean;
  sellableLocations?: StockLocationBreakdown[];
}

export function QuickSellButton({
  listingId,
  listingType,
  status,
  productLabel,
  listedPrice,
  currency,
  platformName,
  platformFeeRate,
  defaultShippingFee,
  compact = false,
  sellableLocations = [],
}: QuickSellButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fifoDefaultLocationId, setFifoDefaultLocationId] = useState<
    string | null
  >(null);
  const [formData, setFormData] = useState({
    quantity: "1",
    unitPrice: listedPrice || "",
    platformFeeRate: platformFeeRate || "",
    platformFeeAmount: "",
    shippingFee: defaultShippingFee || "",
    shipFromLocationId: "",
    customerName: "散客",
    customerEmail: "",
    customerPhone: "",
    shippingAddress: "",
    externalOrderNo: "",
  });

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      unitPrice: listedPrice || prev.unitPrice,
      platformFeeRate: platformFeeRate || prev.platformFeeRate,
      shippingFee: defaultShippingFee || prev.shippingFee,
    }));
  }, [listedPrice, platformFeeRate, defaultShippingFee]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || listingType !== "SKU") return;

    let cancelled = false;
    void getListingFifoShipFromLocation(listingId).then(({ locationId }) => {
      if (cancelled || !locationId) return;
      setFifoDefaultLocationId(locationId);
      setFormData((prev) =>
        prev.shipFromLocationId
          ? prev
          : { ...prev, shipFromLocationId: locationId }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [open, listingId, listingType]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (status !== "ACTIVE") return null;

  const handleOpen = () => {
    setFifoDefaultLocationId(null);
    setFormData((prev) => ({ ...prev, shipFromLocationId: "" }));
    setOpen(true);
  };

  const handleClose = () => {
    if (loading) return;
    setOpen(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const result = await quickSellListing({
        listingId,
        quantity: listingType === "ITEM_UNIT" ? "1" : formData.quantity,
        unitPrice: formData.unitPrice || undefined,
        platformFeeRate: formData.platformFeeRate || undefined,
        platformFeeAmount: formData.platformFeeAmount || undefined,
        shippingFee: formData.shippingFee || undefined,
        shipFromLocationId:
          listingType === "SKU" ? formData.shipFromLocationId || undefined : undefined,
        customerName: formData.customerName || undefined,
        customerEmail: formData.customerEmail || undefined,
        customerPhone: formData.customerPhone || undefined,
        shippingAddress: formData.shippingAddress || undefined,
        externalOrderNo: formData.externalOrderNo || undefined,
      });

      if (!result.success) {
        alert(result.error);
        return;
      }

      setOpen(false);
      router.push(`/sales/${result.orderId}`);
      router.refresh();
    } catch (error) {
      console.error("Quick sell failed:", error);
      alert(error instanceof Error ? error.message : "登记售出失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const quantity = listingType === "ITEM_UNIT" ? 1 : Number(formData.quantity || 0);
  const unitPrice = Number(formData.unitPrice || 0);
  const grossAmount = quantity * unitPrice;
  const feeRate = Number(formData.platformFeeRate || 0);
  const calculatedPlatformFee = grossAmount * feeRate;
  const platformFee = formData.platformFeeAmount
    ? Number(formData.platformFeeAmount || 0)
    : calculatedPlatformFee;
  const shippingFee = Number(formData.shippingFee || 0);
  const estimatedNet = grossAmount - platformFee - shippingFee;
  const money = (value: number) =>
    `${currency || ""} ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`.trim();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={compact ? "h-7 px-2.5 text-xs" : undefined}
        onClick={handleOpen}
      >
        <ShoppingCart className={compact ? "mr-1 h-3 w-3" : "mr-2 h-4 w-4"} />
        {compact ? "售出" : "登记售出"}
      </Button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <Card className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>登记售出</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {productLabel}
                  </p>
                  {platformName ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      平台：{platformName}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-muted-foreground hover:text-foreground"
                  disabled={loading}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`quantity-${listingId}`}>数量</Label>
                    <Input
                      id={`quantity-${listingId}`}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={listingType === "ITEM_UNIT" ? "1" : formData.quantity}
                      disabled={listingType === "ITEM_UNIT" || loading}
                      onChange={(event) =>
                        setFormData({ ...formData, quantity: event.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`unitPrice-${listingId}`}>
                      最终售出单价 {currency ? `(${currency})` : ""}
                    </Label>
                    <Input
                      id={`unitPrice-${listingId}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.unitPrice}
                      onChange={(event) =>
                        setFormData({ ...formData, unitPrice: event.target.value })
                      }
                      placeholder="最终成交单价"
                      disabled={loading}
                    />
                  </div>
                </div>

                {listingType === "SKU" ? (
                  <div className="space-y-2">
                    <Label htmlFor={`shipFromLocationId-${listingId}`}>
                      发货方 / 发货仓
                    </Label>
                    <Select
                      id={`shipFromLocationId-${listingId}`}
                      value={formData.shipFromLocationId}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          shipFromLocationId: event.target.value,
                        })
                      }
                      disabled={loading || sellableLocations.length === 0}
                      required
                    >
                      {sellableLocations.length === 0 ? (
                        <option value="">暂无可售仓位</option>
                      ) : (
                        sellableLocations.map((location) => (
                          <option
                            key={location.locationId}
                            value={location.locationId}
                          >
                            {location.code} · {location.name}（可发 {location.qty}）
                            {location.locationId === fifoDefaultLocationId
                              ? " · FIFO 默认"
                              : ""}
                          </option>
                        ))
                      )}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      默认选中全库存先进先出会优先发货的仓位；如需改由其他仓位发出可手动调整。
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`platformFeeRate-${listingId}`}>
                      平台费率
                    </Label>
                    <Input
                      id={`platformFeeRate-${listingId}`}
                      type="number"
                      min="0"
                      step="0.0001"
                      value={formData.platformFeeRate}
                      onChange={(event) =>
                        setFormData({ ...formData, platformFeeRate: event.target.value })
                      }
                      placeholder="如 0.1"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`platformFeeAmount-${listingId}`}>
                      平台手续费 {currency ? `(${currency})` : ""}
                    </Label>
                    <Input
                      id={`platformFeeAmount-${listingId}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.platformFeeAmount}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          platformFeeAmount: event.target.value,
                        })
                      }
                      placeholder={money(calculatedPlatformFee)}
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`shippingFee-${listingId}`}>
                      邮费成本 {currency ? `(${currency})` : ""}
                    </Label>
                    <Input
                      id={`shippingFee-${listingId}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.shippingFee}
                      onChange={(event) =>
                        setFormData({ ...formData, shippingFee: event.target.value })
                      }
                      placeholder="实际邮费"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`customerName-${listingId}`}>客户名称</Label>
                    <Input
                      id={`customerName-${listingId}`}
                      value={formData.customerName}
                      onChange={(event) =>
                        setFormData({ ...formData, customerName: event.target.value })
                      }
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`externalOrderNo-${listingId}`}>平台订单号</Label>
                    <Input
                      id={`externalOrderNo-${listingId}`}
                      value={formData.externalOrderNo}
                      onChange={(event) =>
                        setFormData({ ...formData, externalOrderNo: event.target.value })
                      }
                      placeholder="选填"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`customerPhone-${listingId}`}>客户电话</Label>
                    <Input
                      id={`customerPhone-${listingId}`}
                      value={formData.customerPhone}
                      onChange={(event) =>
                        setFormData({ ...formData, customerPhone: event.target.value })
                      }
                      placeholder="选填"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`customerEmail-${listingId}`}>客户邮箱</Label>
                    <Input
                      id={`customerEmail-${listingId}`}
                      type="email"
                      value={formData.customerEmail}
                      onChange={(event) =>
                        setFormData({ ...formData, customerEmail: event.target.value })
                      }
                      placeholder="选填"
                      disabled={loading}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor={`shippingAddress-${listingId}`}>收货信息</Label>
                    <Input
                      id={`shippingAddress-${listingId}`}
                      value={formData.shippingAddress}
                      onChange={(event) =>
                        setFormData({
                          ...formData,
                          shippingAddress: event.target.value,
                        })
                      }
                      placeholder="选填：地址 / 备注"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">成交总额</span>
                      <span className="font-medium">{money(grossAmount)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">平台手续费</span>
                      <span className="font-medium text-destructive">
                        -{money(platformFee)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">邮费成本</span>
                      <span className="font-medium text-destructive">
                        -{money(shippingFee)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="font-medium">预估到手</span>
                      <span className="font-semibold text-emerald-700">
                        {money(estimatedNet)}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    平台手续费为空时按费率自动计算；填写手续费金额后优先使用实际金额。
                  </p>
                </div>

                <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1.5">
                  <p>提交后生成已确认销售订单。实物扣减在「确认发货」时写入库存台账。</p>
                  {listingType === "SKU" ? (
                    <p>
                      批次库存按所选发货方内的<strong className="font-medium text-foreground">入库时间先进先出</strong>
                      自动匹配到具体批次。
                    </p>
                  ) : (
                    <p>中古单品将扣减对应单件及其所在仓位。</p>
                  )}
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={loading}
                  >
                    取消
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "处理中..." : "确认登记"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          </div>,
          document.body
        )}
    </>
  );
}

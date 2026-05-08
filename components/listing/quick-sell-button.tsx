"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { quickSellListing } from "@/app/actions/listings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingCart, X } from "lucide-react";

interface QuickSellButtonProps {
  listingId: string;
  listingType: "SKU" | "ITEM_UNIT";
  status: string;
  productLabel: string;
  listedPrice?: string | null;
  currency?: string | null;
}

export function QuickSellButton({
  listingId,
  listingType,
  status,
  productLabel,
  listedPrice,
  currency,
}: QuickSellButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    quantity: "1",
    unitPrice: listedPrice || "",
    customerName: "散客",
    externalOrderNo: "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (status !== "ACTIVE") return null;

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
        customerName: formData.customerName || undefined,
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
      alert(error instanceof Error ? error.message : "快捷售出失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ShoppingCart className="mr-2 h-4 w-4" />
        售出
      </Button>

      {mounted &&
        open &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <Card className="relative z-10 w-full max-w-lg">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>快捷售出</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {productLabel}
                  </p>
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
                      售出单价 {currency ? `(${currency})` : ""}
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
                      placeholder="未填写则按 0 记录"
                      disabled={loading}
                    />
                  </div>
                </div>

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

                <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                  提交后会直接生成已确认销售订单，并立即扣减库存。
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
                    {loading ? "处理中..." : "确认售出"}
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

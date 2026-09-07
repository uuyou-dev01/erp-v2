"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDot, Clock3, PackageCheck, Truck } from "lucide-react";
import {
  confirmTransferShipmentReceiptAction,
  type TransferLocationOption,
} from "@/app/actions/transfer-shipments";
import { BackButton } from "@/components/shared/back-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatLocationRegion } from "@/lib/inventory/location-regions";

type TransferShipment = {
  id: string;
  status: string;
  trackingNo: string | null;
  carrier: string | null;
  transportMode: string | null;
  carriedBy: string | null;
  grossWeightKg: string | null;
  etaDate: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  note: string | null;
  shippingCost: string | null;
  shippingCurrency: string | null;
  fromLocation: {
    id: string;
    code: string;
    name: string;
    region: string | null;
  } | null;
  toLocation: {
    id: string;
    code: string;
    name: string;
    region: string | null;
  } | null;
  lines: Array<{
    id: string;
    entityType: string;
    entityId: string;
    quantity: string;
    status: string;
    skuCode: string;
    skuName: string;
    unitCode: string | null;
  }>;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待发出确认",
  IN_TRANSIT: "发出方已确认 · 待收货",
  DELIVERED: "收货方已确认",
  EXCEPTION: "运输异常",
};

const TRANSPORT_LABELS: Record<string, string> = {
  HAND_CARRY: "本人或朋友携带",
  CONSOLIDATOR: "集运商 / 转运商",
  POSTAL: "邮局寄送",
  COURIER: "快递 / 配送",
  FREIGHT: "货运",
  OTHER: "其他",
};

function dateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function locationLabel(location: TransferShipment["fromLocation"]) {
  if (!location) return "未记录位置";
  return `${formatLocationRegion(location.region)} · ${location.name} · ${location.code}`;
}

export function TransferShipmentDetail({
  shipment,
  locations,
}: {
  shipment: TransferShipment;
  locations: TransferLocationOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [destinationLocationId, setDestinationLocationId] = useState(shipment.toLocation?.id ?? "");
  const [receiptNote, setReceiptNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const totalQuantity = shipment.lines.reduce((sum, line) => sum + Number(line.quantity), 0);
  const canReceive = shipment.status === "IN_TRANSIT";

  const confirmReceipt = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmTransferShipmentReceiptAction({
        shipmentId: shipment.id,
        receivedAt,
        destinationLocationId,
        note: receiptNote,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <BackButton label="" fallbackHref="/logistics/transfers" className="mt-0.5" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              {shipment.trackingNo || `转运包裹 ${shipment.id.slice(0, 8)}`}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {locationLabel(shipment.fromLocation)}
              <ArrowRight className="mx-2 inline h-3.5 w-3.5" />
              {locationLabel(shipment.toLocation)}
            </p>
          </div>
        </div>
        <Badge variant={shipment.status === "EXCEPTION" ? "destructive" : "outline"}>
          {STATUS_LABELS[shipment.status] ?? shipment.status}
        </Badge>
      </div>

      <section
        aria-label="转运确认进度"
        className="grid overflow-hidden rounded-lg border sm:grid-cols-2"
      >
        <div className="flex gap-3 border-b bg-muted/20 p-4 sm:border-b-0 sm:border-r">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="text-sm font-medium">发出方已确认</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {locationLabel(shipment.fromLocation)} · {dateTime(shipment.shippedAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-4">
          {shipment.status === "DELIVERED" ? (
            <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <div>
            <p className="text-sm font-medium">
              {shipment.status === "DELIVERED" ? "收货方已确认" : "等待收货方确认"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {locationLabel(shipment.toLocation)}
              {shipment.receivedAt ? ` · ${dateTime(shipment.receivedAt)}` : ""}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">包裹商品</h2>
            <span className="text-xs text-muted-foreground">
              {shipment.lines.length} 项 · 共{" "}
              {totalQuantity.toLocaleString("zh-CN", { maximumFractionDigits: 4 })} 件
            </span>
          </div>
          <div className="divide-y">
            {shipment.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {line.skuCode} · {line.skuName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {line.entityType === "ITEM_UNIT"
                      ? `一物一单 ${line.unitCode ?? line.entityId.slice(-8)}`
                      : `批次库存 ${line.entityId.slice(-8)}`}
                    {line.status === "RECEIVED" ? " · 已入目标位置" : " · 在途锁定"}
                  </p>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">× {line.quantity}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-sm font-semibold">运输信息</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">方式</dt>
                <dd className="text-right">
                  {TRANSPORT_LABELS[shipment.transportMode ?? ""] ?? "未填写"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">承运商</dt>
                <dd className="text-right">{shipment.carrier || shipment.carriedBy || "-"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">预计到货</dt>
                <dd className="text-right">{dateTime(shipment.etaDate)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">毛重</dt>
                <dd className="text-right">
                  {shipment.grossWeightKg ? `${shipment.grossWeightKg} kg` : "-"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">邮费</dt>
                <dd className="text-right">
                  {shipment.shippingCost
                    ? `${shipment.shippingCurrency ?? ""} ${shipment.shippingCost}`
                    : "-"}
                </dd>
              </div>
            </dl>
            {shipment.note ? (
              <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">
                {shipment.note}
              </p>
            ) : null}
          </section>

          {canReceive ? (
            <section className="space-y-4 rounded-lg border bg-card p-4">
              <div>
                <h2 className="text-sm font-semibold">收货方确认</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  确认后所选库存才会进入实际到货位置，并写入转出、转入流水。
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-received-at">实际到货日</Label>
                <Input
                  id="transfer-received-at"
                  type="date"
                  value={receivedAt}
                  onChange={(event) => setReceivedAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-received-location">实际到货位置</Label>
                <Select
                  id="transfer-received-location"
                  value={destinationLocationId}
                  onChange={(event) => setDestinationLocationId(event.target.value)}
                >
                  <option value="">请选择到货位置</option>
                  {locations
                    .filter((location) => location.id !== shipment.fromLocation?.id)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {formatLocationRegion(location.region)} · {location.name} · {location.code}
                      </option>
                    ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="transfer-receipt-note">到货备注</Label>
                <Textarea
                  id="transfer-receipt-note"
                  value={receiptNote}
                  onChange={(event) => setReceiptNote(event.target.value)}
                  placeholder="如有外箱破损或数量异常，请记录后再确认"
                />
              </div>
              {error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                className="w-full"
                disabled={pending || !destinationLocationId}
                onClick={confirmReceipt}
              >
                {pending ? "正在确认到货…" : "确认到货并入库"}
              </Button>
            </section>
          ) : (
            <section className="flex gap-3 rounded-lg border bg-card p-4">
              {shipment.status === "DELIVERED" ? (
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              ) : shipment.status === "EXCEPTION" ? (
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Truck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">{STATUS_LABELS[shipment.status]}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {shipment.status === "DELIVERED"
                    ? "该包裹的发出与到货两端均已确认。"
                    : "当前状态不能执行收货确认，请先处理运输异常。"}
                </p>
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

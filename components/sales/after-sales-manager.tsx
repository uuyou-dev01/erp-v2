"use client";

import { useMemo, useState, useTransition } from "react";
import {
  authorizeAfterSalesCaseAction,
  createAfterSalesCaseAction,
  receiveAfterSalesReturnAction,
  resolveAfterSalesCaseAction,
} from "@/app/actions/after-sales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Order = {
  id: string;
  orderNumber: string;
  externalOrderNo: string | null;
  currency: string;
  lines: Array<{ id: string; quantity: string; sku: { name: string; code: string } }>;
};

export function AfterSalesCreator({ orders, locations }: { orders: Order[]; locations: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState("RETURN");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const selectedOrder = useMemo(() => orders.find((order) => order.id === orderId), [orders, orderId]);
  return <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); if (!selectedOrder) return;
    startTransition(async () => {
      const result = await createAfterSalesCaseAction({ customerOrderId: selectedOrder.id, type, reason: String(form.get("reason") || ""), responsibility: String(form.get("responsibility") || "") || undefined, refundAmount: String(form.get("refundAmount") || "") || undefined, refundCurrency: selectedOrder.currency, targetLocationId: String(form.get("targetLocationId") || "") || undefined, lines: selectedOrder.lines.filter((line) => Number(quantities[line.id] || 0) > 0).map((line) => ({ orderLineId: line.id, quantity: quantities[line.id] })) });
      setMessage(result.success ? "售后单已创建" : result.error);
    });
  }}>
    <div className="space-y-2"><Label htmlFor="orderId">销售订单</Label><Select id="orderId" required value={orderId} onChange={(event) => { setOrderId(event.target.value); setQuantities({}); }}><option value="">请选择</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.orderNumber}{order.externalOrderNo ? ` / ${order.externalOrderNo}` : ""}</option>)}</Select></div>
    <div className="space-y-2"><Label htmlFor="type">售后类型</Label><Select id="type" value={type} onChange={(event) => setType(event.target.value)}><option value="RETURN">退货</option><option value="REFUND_ONLY">仅退款</option><option value="EXCHANGE">换货</option><option value="RESHIP">补寄</option><option value="REFUSED">拒收</option><option value="CANCEL_AFTER_SHIP">发货后取消</option></Select></div>
    <div className="space-y-2"><Label htmlFor="targetLocationId">退件目标仓库</Label><Select id="targetLocationId" name="targetLocationId"><option value="">无需退件/待确定</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></div>
    <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="refundAmount">退款金额</Label><Input id="refundAmount" name="refundAmount" type="number" min="0" step="0.0001" /></div><div className="space-y-2"><Label htmlFor="responsibility">责任方</Label><Select id="responsibility" name="responsibility"><option value="">待判断</option><option value="SELLER">销售方</option><option value="CUSTOMER">客户</option><option value="PLATFORM">平台</option><option value="WAREHOUSE">仓库</option><option value="CARRIER">承运商</option><option value="SUPPLIER">供应方</option><option value="SHARED">共同承担</option></Select></div></div>
    {selectedOrder && type !== "REFUND_ONLY" ? <fieldset className="space-y-2 md:col-span-2"><legend className="text-sm font-medium">售后商品与数量</legend><div className="grid gap-2">{selectedOrder.lines.map((line) => <label key={line.id} className="grid grid-cols-[1fr_120px] items-center gap-3 rounded-md border p-3 text-sm"><span>{line.sku.name}（{line.sku.code}）· 可申请 {line.quantity}</span><Input aria-label={`${line.sku.name} 售后数量`} type="number" min="0" max={line.quantity} step="0.0001" value={quantities[line.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /></label>)}</div></fieldset> : null}
    <div className="space-y-2 md:col-span-2"><Label htmlFor="reason">原因</Label><Textarea id="reason" name="reason" required /></div>
    <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={pending || !selectedOrder}>{pending ? "创建中…" : "创建售后单"}</Button>{message ? <span className="text-sm text-muted-foreground">{message}</span> : null}</div>
  </form>;
}

export function AfterSalesRowActions({ id, status, type, owner }: { id: string; status: string; type: string; owner: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (task: () => Promise<{ success: boolean; error?: string }>) => startTransition(async () => { const result = await task(); setMessage(result.success ? "已更新" : (result.error ?? "操作失败")); });
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {status === "REQUESTED" && owner ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => authorizeAfterSalesCaseAction(id))}>授权</Button> : null}
    {["AUTHORIZED", "IN_TRANSIT"].includes(status) && type !== "REFUND_ONLY" ? <Button size="sm" disabled={pending} onClick={() => run(() => receiveAfterSalesReturnAction(id))}>登记退件收货</Button> : null}
    {(status === "INSPECTING" || type === "REFUND_ONLY") ? <Button size="sm" disabled={pending} onClick={() => run(() => resolveAfterSalesCaseAction(id, { resolution: type === "REFUND_ONLY" ? "RESTOCK" : (window.prompt("处理结果：RESTOCK / QUARANTINE / DOWNGRADE / SCRAP / RETURN_TO_SUPPLIER / REPLACE", "RESTOCK") || ""), note: window.prompt("检查说明（可选）") || undefined }))}>完成检查/退款</Button> : null}
    {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
  </div>;
}

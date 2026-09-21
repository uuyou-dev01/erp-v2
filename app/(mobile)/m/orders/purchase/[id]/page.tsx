import { notFound } from "next/navigation";
import { MobilePage, MobileEntry } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getPurchaseOrderById } from "@/app/actions/purchase-orders";
import { prisma } from "@/lib/prisma";
import { PurchaseOrderActions } from "@/components/procurement/purchase-order-actions";
import { ReceiveGoodsForm } from "@/components/procurement/receive-goods-form";
import { MobilePurchaseFees } from "@/components/mobile/mobile-purchase-fees";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { activeStoreId: storeId } = await requireMobilePageContext();
  const { id } = await params;
  const order = await getPurchaseOrderById(id, storeId);
  if (!order) notFound();
  const [locations, fees] = await Promise.all([
    prisma.location.findMany({ where: { storeId }, select: { id: true, code: true, name: true } }),
    prisma.fee.findMany({ where: { refType: "PURCHASE_ORDER", refId: id } }),
  ]);
  return (
    <MobilePage title="采购记录" description={order.orderNo}>
      <section className="rounded-xl bg-slate-50 p-4">
        <p className="text-lg font-semibold">
          {order.currency} {order.totalAmount}
        </p>
        <p className="mt-1 text-xs text-slate-500">含分摊费用的采购总额，不代表已经付款</p>
        {order.lines.map((line) => (
          <p key={line.id} className="mt-3 text-sm">
            {line.sku.name} × {line.quantity.toString()}
          </p>
        ))}
      </section>
      <PurchaseOrderActions
        order={{
          id: order.id,
          status: order.status,
          lines: order.lines.map((l) => l.id),
          trackingNo: order.trackingNo,
          carrier: order.carrier,
          etaDate: order.etaDate,
          shipmentNote: order.shipmentNote,
        }}
      />
      {!["CANCELLED", "RETURNED"].includes(order.status) && (
        <MobilePurchaseFees
          key={order.updatedAt.toISOString()}
          orderId={id}
          expectedUpdatedAt={order.updatedAt.toISOString()}
          currency={order.currency}
          total={order.subtotal}
          lines={order.lines.map((l) => ({
            purchaseLineId: l.id,
            amount: l.lineAmount.toString(),
          }))}
          fees={fees.map((f) => ({
            feeType: f.feeType,
            amount: f.amount.toString(),
            currency: f.currency,
          }))}
        />
      )}
      {["ORDERED", "SHIPPED"].includes(order.status) && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">整单到货入库</h2>
          <p className="text-xs text-slate-500">
            确认整单已收到后选择仓库；少件或分批到货请进入完整订单处理。
          </p>
          <ReceiveGoodsForm
            purchaseOrderId={id}
            locations={locations}
            lineCount={order.lines.length}
            mobile
          />
        </section>
      )}
      <MobileEntry
        href={`/procurement/${id}`}
        title="完整订单与异常处理"
        description="查看费用流水、质检、退货及更正记录"
      />
      <MobileEntry href="/m/orders" title="返回最近订单" description="继续补录其他采购记录" />
    </MobilePage>
  );
}

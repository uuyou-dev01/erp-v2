import { notFound } from "next/navigation";
import { MobilePage, MobileEntry } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getCustomerOrderById } from "@/app/actions/customer-orders";
import { SettleOrderDialog } from "@/components/sales/settle-order-dialog";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { activeStoreId: storeId } = await requireMobilePageContext();
  const { id } = await params;
  const order = await getCustomerOrderById(id);
  if (!order || order.storeId !== storeId) notFound();
  const store = await prisma.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { currency: true },
  });
  const status: Record<string, string> = {
    DRAFT: "草稿",
    CONFIRMED: "待发货",
    SHIPPED: "已发货",
    DELIVERED: "已送达",
    RETURNED: "已退货",
    CANCELLED: "已取消",
    PAID: "已付款",
    PLACED: "已下单",
  };
  return (
    <MobilePage
      title="销售记录"
      description={`${order.orderNumber} · ${status[order.orderStatus] ?? "处理中"}`}
    >
      <section className="space-y-3 rounded-xl bg-slate-50 p-4">
        <p className="text-xl font-semibold">
          {order.currency} {order.totalPaid.toString()}
        </p>
        <p className="text-xs text-slate-500">
          {order.customerName || "散客"} · {order.platform?.name || "未指定平台"}
        </p>
        {order.lines.map((line) => (
          <p key={line.id} className="text-sm">
            {line.sku.name} × {line.quantity.toString()}
          </p>
        ))}
        <p className="text-sm">
          邮费 {order.shippingFee.toString()} ·{" "}
          {order.shippingFeeStatus === "ACTUAL"
            ? "实际"
            : order.shippingFeeStatus === "PENDING"
              ? "待核算"
              : "预估"}
        </p>
        <p className="text-sm">平台手续费 {order.platformFee.toString()}</p>
      </section>
      {!["DRAFT", "CANCELLED", "RETURNED"].includes(order.orderStatus) && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="font-semibold">核对售价、邮费与结算</h2>
          <p className="text-xs leading-5 text-slate-500">
            填实际邮费和平台手续费后重新计算订单利润。订单结算不代表平台资金已到账。
          </p>
          <SettleOrderDialog
            orderId={id}
            currency={order.currency}
            defaultSalePrice={order.subtotal.toString()}
            defaultPlatformFee={order.platformFee.toString()}
            defaultShippingFee={
              order.shippingFeeStatus === "PENDING" ? undefined : order.shippingFee.toString()
            }
            defaultFeeRate={order.platform?.defaultFeeRate?.toString()}
            defaultFxRate={order.settlementFxRate?.toString()}
            baseCurrency={store.currency}
            requireActualShippingFee={order.shippingFeeStatus === "PENDING"}
          />
        </section>
      )}
      <MobileEntry
        href="/m/tasks"
        title="发货与物流待办"
        description="查看待发货订单，补运单和发货凭证"
      />
      <MobileEntry
        href={`/sales/${id}`}
        title="完整订单与售后"
        description="更正信息、取消、退货退款及详细利润"
      />
      <MobileEntry
        href="/m/orders?kind=sale"
        title="返回最近销售"
        description="继续补录其他销售记录"
      />
    </MobilePage>
  );
}

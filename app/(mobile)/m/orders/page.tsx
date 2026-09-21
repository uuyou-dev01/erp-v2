import Link from "next/link";
import { MobilePage } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string }>;
}) {
  const { activeStoreId: storeId } = await requireMobilePageContext("/m/orders");
  const { kind = "purchase", q = "" } = await searchParams;
  const purchase = kind !== "sale";
  const rows = purchase
    ? await prisma.purchaseOrder.findMany({
        where: {
          storeId,
          ...(q
            ? {
                OR: [
                  { orderNo: { contains: q, mode: "insensitive" as const } },
                  { supplierName: { contains: q, mode: "insensitive" as const } },
                  {
                    lines: {
                      some: { sku: { name: { contains: q, mode: "insensitive" as const } } },
                    },
                  },
                ],
              }
            : {}),
        },
        include: { lines: { include: { sku: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      })
    : await prisma.customerOrder.findMany({
        where: {
          storeId,
          ...(q
            ? {
                OR: [
                  { orderNumber: { contains: q, mode: "insensitive" as const } },
                  { customerName: { contains: q, mode: "insensitive" as const } },
                  {
                    lines: {
                      some: { sku: { name: { contains: q, mode: "insensitive" as const } } },
                    },
                  },
                ],
              }
            : {}),
        },
        include: { lines: { include: { sku: true } } },
        orderBy: { updatedAt: "desc" },
        take: 50,
      });
  const labels: Record<string, string> = {
    DRAFT: "草稿",
    ORDERED: "已下单",
    SHIPPED: "已发货",
    RECEIVED: "已收货",
    CANCELLED: "已取消",
    RETURNED: "已退货",
    CONFIRMED: "待发货",
    DELIVERED: "已送达",
    PLACED: "已下单",
    PAID: "已付款",
  };
  return (
    <MobilePage
      title="最近订单"
      description="补邮费、物流、收货和结算；显示最近更新的 50 条，可搜索历史订单。"
    >
      <nav className="flex gap-3">
        <Link
          className={`rounded-xl px-4 py-3 text-sm ${purchase ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          href="/m/orders?kind=purchase"
        >
          采购
        </Link>
        <Link
          className={`rounded-xl px-4 py-3 text-sm ${!purchase ? "bg-blue-600 text-white" : "bg-slate-100"}`}
          href="/m/orders?kind=sale"
        >
          销售
        </Link>
      </nav>
      <form className="flex gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input
          name="q"
          defaultValue={q}
          aria-label="搜索订单"
          placeholder="订单号、商品或交易对象"
          className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
        />
        <button className="rounded-xl bg-slate-950 px-4 text-sm text-white">搜索</button>
      </form>
      {!rows.length && <p className="py-10 text-center text-sm text-slate-500">暂无匹配的订单</p>}
      {rows.map((row) => {
        const isPurchase = "orderNo" in row;
        return (
          <Link
            key={row.id}
            href={`/m/orders/${isPurchase ? "purchase" : "sale"}/${row.id}`}
            className="block space-y-2 border-b pb-4"
          >
            <p className="text-sm font-semibold">
              {row.lines.map((l) => l.sku.name).join("、") || "未添加商品"}
            </p>
            <p className="break-all text-xs text-slate-500">
              {isPurchase ? row.orderNo : row.orderNumber} ·{" "}
              {labels[isPurchase ? row.status : row.orderStatus] ?? "处理中"}
            </p>
            <p className="text-sm">
              {row.currency} {String(isPurchase ? row.totalAmount : row.totalPaid)}{" "}
              <span className="float-right text-blue-700">查看 / 补录 →</span>
            </p>
          </Link>
        );
      })}
    </MobilePage>
  );
}

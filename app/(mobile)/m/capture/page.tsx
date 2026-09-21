import { MobilePage, MobileEntry } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
export default async function Page() {
  await requireMobilePageContext("/m/capture");
  return (
    <MobilePage title="记一笔" description="从发生的事情开始，记录后继续跟进。">
      <MobileEntry
        href="/m/capture/purchase"
        title="买了东西"
        description="已有商品直接选，新商品随采购一起创建"
      />
      <MobileEntry
        href="/m/listings"
        title="卖掉了"
        description="登记成交数量与金额，进入发货流程"
      />
      <MobileEntry
        href="/m/expenses"
        title="记邮费 / 其他费用"
        description="订单邮费从原单补录，零散费用单独登记"
      />
      <MobileEntry
        href="/m/orders?kind=sale"
        title="核对销售结算"
        description="实际售价、邮费与平台手续费"
      />
      <MobileEntry
        href="/m/orders"
        title="到货与物流"
        description="找采购单，补运单或确认整单到货"
      />
      <details className="rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-semibold">价格记录与照片</summary>
        <div className="mt-4 space-y-3">
          <MobileEntry
            href="/m/capture/price"
            title="记录市场价格"
            description="看到但还没买，留作价格参考"
          />
          <MobileEntry href="/m/prices" title="价格记录" description="查看过去记录的价格" />
          <MobileEntry href="/m/items" title="实物拍照" description="给库存中的单件商品补照片" />
        </div>
      </details>
    </MobilePage>
  );
}

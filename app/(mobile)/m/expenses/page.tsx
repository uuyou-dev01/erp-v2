import { MobilePage, MobileEntry } from "@/components/mobile/mobile-page";
import { requireMobilePageContext } from "@/lib/mobile/page-auth";
import { getChargeLedgerData } from "@/app/actions/charges";
import { MobileExpenseForm } from "@/components/mobile/mobile-expense-form";
import { prisma } from "@/lib/prisma";
export const dynamic = "force-dynamic";
export default async function Page() {
  const context = await requireMobilePageContext("/m/expenses");
  const [data, store] = await Promise.all([
    getChargeLedgerData(),
    prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { currency: true },
    }),
  ]);
  return (
    <MobilePage title="记费用" description="订单相关费用从原单补录；零散费用先保存到费用子账。">
      <div className="grid grid-cols-2 gap-2">
        <MobileEntry href="/m/orders?kind=purchase" title="采购邮费" description="计入原采购成本" />
        <MobileEntry
          href="/m/orders?kind=sale"
          title="销售邮费"
          description="核对实际邮费与手续费"
        />
      </div>
      <MobileExpenseForm
        categories={data.categories.map((c) => ({ id: c.id, name: c.name }))}
        currency={store.currency}
        draftScope={`${context.userId}:${context.organizationId}:${context.activeStoreId}`}
      />
      <h2 className="font-semibold">最近零散费用</h2>
      {data.events
        .filter((e) => e.sourceType === "MOBILE_EXPENSE")
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, 20)
        .map((e) => (
          <div key={e.id} className="border-b pb-3 text-sm">
            <p>{e.description}</p>
            <p className="mt-1 text-slate-500">
              {e.currency} {e.amount} ·{" "}
              {e.status === "DRAFT"
                ? "待确认"
                : e.status === "SUBMITTED"
                  ? "已提交"
                  : e.status === "CONFIRMED"
                    ? "已确认"
                    : e.status}
            </p>
          </div>
        ))}
      <MobileEntry
        href="/finance/charges"
        title="费用确认与更正"
        description="按现有费用流程确认、结算或冲销，避免重复记账"
      />
    </MobilePage>
  );
}

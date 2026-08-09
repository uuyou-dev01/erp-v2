import Link from "next/link";
import { notFound } from "next/navigation";
import { getSettlementById } from "@/app/actions/settlements";
import { SettlementStatusActions } from "@/components/finance/settlement-actions";
import { SettlementStatusBadge } from "@/components/finance/settlement-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserContext } from "@/lib/auth/user-context";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function formatMoney(currency: string | null, amount: string | null) {
  if (!amount) return "-";
  return `${currency ?? ""} ${amount}`.trim();
}

const lineTypeLabels: Record<string, string> = {
  SUPPLY_COST: "供货货款",
  COMMISSION: "代卖收益",
  PLATFORM_FEE: "平台费用",
  SHIPPING_FEE: "代垫运费",
  FULFILLMENT_FEE: "代发服务费",
  OWNER_PROFIT_SHARE: "货主利润分配",
};

const directionLabels: Record<string, string> = {
  PAYABLE: "计入本次应付",
  RECEIVABLE: "从本次应付中扣减",
  INFORMATIONAL: "已单独记账，不重复计入",
};

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await requireUserContext();
  const settlement = await getSettlementById(id);
  if (!settlement) notFound();
  const organizationIds = [settlement.payerOrganizationId, settlement.payeeOrganizationId]
    .filter((organizationId): organizationId is string => Boolean(organizationId));
  const organizations = organizationIds.length > 0
    ? await prisma.organization.findMany({
        where: { id: { in: organizationIds } },
        select: { id: true, name: true },
      })
    : [];
  const organizationName = new Map(organizations.map((organization) => [organization.id, organization.name]));
  const canManage =
    hasRoleAtLeast(context.role, ROLES.FINANCE) &&
    (settlement.payerOrganizationId
      ? settlement.payerOrganizationId === context.organizationId
      : context.storeIds.includes(settlement.storeId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold">{settlement.settlementNo}</h1>
            <SettlementStatusBadge status={settlement.status} />
          </div>
          <p className="text-muted-foreground">
            线下结算记录 · 对象：{settlement.partner?.name ?? "主体往来"}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {canManage ? <SettlementStatusActions id={settlement.id} status={settlement.status} /> : (
            <p className="text-sm text-muted-foreground">收款方可查看，状态由付款方确认。</p>
          )}
          <Link href="/finance/settlements">
            <Button variant="ghost" size="sm">返回结算记录</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本次记录金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(settlement.currency, settlement.totalAmount)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">本位币金额</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{formatMoney(settlement.baseCurrency, settlement.baseAmount)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">履约请求</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{settlement.fulfillmentRequest?.requestNo ?? "-"}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">付款方 → 收款方</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-semibold">
            {settlement.payerOrganizationId
              ? organizationName.get(settlement.payerOrganizationId) ?? settlement.payerOrganizationId
              : "历史记录未标注"}
            <span className="mx-2 text-muted-foreground">→</span>
            {settlement.payeeOrganizationId
              ? organizationName.get(settlement.payeeOrganizationId) ?? settlement.payeeOrganizationId
              : "历史记录未标注"}
          </CardContent>
        </Card>
      </div>

      {settlement.agreementTermsSnapshot ? <Card>
        <CardHeader>
          <CardTitle>本单合作约定 · 版本 {settlement.agreementVersion ?? "-"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{settlement.agreementTermsSnapshot}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            此处保存的是成交时快照，后续修改货盘约定不会改变本单。
          </p>
        </CardContent>
      </Card> : null}

      <Card>
        <CardHeader>
          <CardTitle>费用明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {settlement.lines.map((line) => (
              <div key={line.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <div className="font-medium">{line.description}</div>
                  <div className="text-sm text-muted-foreground">
                    {lineTypeLabels[line.lineType] || line.lineType} · {directionLabels[line.direction] || line.direction}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {line.sourceType === "FULFILLMENT_REQUEST"
                    ? "来自本次发货"
                    : line.sourceType === "RESALE_LISTING"
                      ? "来自本条代卖"
                      : "业务费用"}
                </div>
                <div className="font-medium">{formatMoney(line.currency, line.amount)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, Building2, PackageCheck } from "lucide-react";
import { getMyRelationshipSummary } from "@/app/actions/relationships";
import { RelationshipOverview } from "@/components/collaboration/relationship-overview";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function CollaborationOverviewPage() {
  const data = await getMyRelationshipSummary();
  const activeCount = data.relationships.filter(
    (relationship) => relationship.status === "ACTIVE"
  ).length;
  const pendingCount = data.relationships.reduce(
    (total, relationship) => total + relationship.pendingTaskCount,
    0
  );

  return (
    <div className="space-y-8">
      <section className="grid gap-6 border-b pb-7 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-sm font-medium text-primary">个人账号下的外部关系</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">我的协作</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            在这里管理别人邀请你参与的任务协作。它与你自己的企业空间并行，双方的数据边界不会混在一起。
          </p>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{activeCount}</p>
            <p className="text-muted-foreground">合作中</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{pendingCount}</p>
            <p className="text-muted-foreground">待处理任务</p>
          </div>
        </div>
      </section>

      <RelationshipOverview
        relationships={data.relationships}
        hasMembership={data.memberships.length > 0}
      />

      <section className="grid gap-4 border-t pt-7 md:grid-cols-2">
        <div className="flex gap-4 rounded-lg bg-muted/40 p-5">
          <PackageCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h2 className="font-medium">只参与任务协作</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              保持现在的个人账号即可。信息确认、订单处理、盘点等任务都会进入同一个入口，不需要建立自己的 ERP。
            </p>
          </div>
        </div>
        <div className="flex gap-4 rounded-lg border p-5">
          <Building2 className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <h2 className="font-medium">准备经营自己的生意</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              创建自己的企业和库存后，可以再与合作企业建立连接，查看对方明确共享的供给。
            </p>
            <Button asChild variant="link" className="mt-2 h-auto p-0">
              <Link href={data.memberships.length ? "/workbench" : "/onboarding"}>
                {data.memberships.length ? "进入我的 ERP" : "创建自己的企业"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

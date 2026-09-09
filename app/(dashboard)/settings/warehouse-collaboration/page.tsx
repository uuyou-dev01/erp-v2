import Link from "next/link";
import { ArrowUpRight, Warehouse } from "lucide-react";
import { getOrganizationWarehouseCollaborators } from "@/app/actions/location-fulfillers";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import {
  WAREHOUSE_ROLE_LABELS,
  type WarehouseFulfillerRole,
} from "@/lib/application/relationship-foundation";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "合作中",
  INVITED: "待接受",
  EXPIRED: "邀请已过期",
  SUSPENDED: "已暂停",
  ENDED: "已结束",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  MEMBER: "企业成员兼任务协作者",
  WAREHOUSE_COLLABORATOR: "外部任务协作者",
  PENDING_INVITATION: "待确认任务协作",
};

export default async function WarehouseCollaborationPage() {
  const { rows } = await getOrganizationWarehouseCollaborators();
  const activeCount = rows.filter((row) => row.status === "ACTIVE").length;
  const coveredLocationCount = new Set(
    rows.flatMap((row) => row.locations.map((location) => location.id))
  ).size;
  const returnTo = "/settings/warehouse-collaboration";

  return (
    <div className="space-y-6">
      <PageHeader
        title="任务协作"
        description="按账号归并外部任务关系；当前按仓库划分协作范围，同一人增加仓库时不会创建重复身份。"
        badge={<Warehouse className="h-5 w-5 text-muted-foreground" />}
      />

      <section className="flex flex-wrap gap-x-10 gap-y-4 border-y py-5" aria-label="任务协作摘要">
        <div>
          <p className="text-xs text-muted-foreground">全部协作者</p>
          <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">合作中</p>
          <p className="mt-1 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">覆盖仓库</p>
          <p className="mt-1 text-2xl font-semibold">{coveredLocationCount}</p>
        </div>
      </section>

      <section aria-labelledby="collaborator-list-title">
        <div className="mb-3">
          <h2 id="collaborator-list-title" className="font-semibold">
            协作关系
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            暂停某个仓库只会撤销该协作范围，已完成任务记录仍保留。
          </p>
        </div>
        <div className="divide-y border-y">
          {rows.length ? (
            rows.map((row) => (
              <article
                key={row.key}
                className="grid gap-4 py-5 lg:grid-cols-[minmax(220px,0.8fr)_minmax(300px,1.4fr)_minmax(180px,0.8fr)]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{row.name}</p>
                    <Badge variant={row.status === "ACTIVE" ? "secondary" : "outline"}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{row.email}</p>
                  <p className="mt-2 text-xs font-medium text-blue-700">
                    {RELATIONSHIP_LABELS[row.relationshipType] ?? row.relationshipType}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.locations.length} 个仓库授权
                  </p>
                </div>

                <div className="space-y-2">
                  {row.locations.map((location) => (
                    <div
                      key={location.rosterId}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <Link
                        href={`/inventory/locations/${location.id}?returnTo=${encodeURIComponent(returnTo)}`}
                        className="inline-flex items-center gap-1 font-medium hover:text-primary"
                      >
                        {location.name}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                      <span className="text-muted-foreground">
                        {WAREHOUSE_ROLE_LABELS[location.role as WarehouseFulfillerRole] ??
                          location.role}
                      </span>
                      {location.isDefault ? <Badge>默认负责人</Badge> : null}
                      {location.status !== "ACTIVE" ? (
                        <Badge variant="outline">
                          {STATUS_LABELS[location.status] ?? location.status}
                        </Badge>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">已记录工作</p>
                  {row.work.length ? (
                    <div className="mt-2 space-y-1">
                      {row.work.map((work) => (
                        <p key={`${work.name}:${work.unit}`} className="text-sm">
                          <span className="font-medium tabular-nums">{work.quantity}</span>{" "}
                          {work.unit} {work.name}
                          <span className="ml-1 text-xs text-muted-foreground">
                            · {work.eventCount} 条
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">暂无完成记录</p>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="py-12 text-center">
              <p className="font-medium">还没有任务协作关系</p>
              <p className="mt-1 text-sm text-muted-foreground">进入具体仓库添加第一位任务协作者。</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

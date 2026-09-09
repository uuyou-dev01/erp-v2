"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Clock3, Link2, MapPin, PauseCircle } from "lucide-react";
import { endMyLocationFulfillerRelationshipAction } from "@/app/actions/location-fulfillers";
import { requestOrganizationConnectionFromWarehouseAction } from "@/app/actions/relationships";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  WAREHOUSE_ROLE_LABELS,
  WAREHOUSE_STATUS_LABELS,
  type WarehouseFulfillerRole,
  type WarehouseFulfillerStatus,
} from "@/lib/application/relationship-foundation";

type Relationship = {
  id: string;
  role: string;
  status: string;
  isDefault: boolean;
  acceptedAt: Date | null;
  pendingTaskCount: number;
  organization: { id: string; name: string };
  location: { id: string; name: string; code: string; region: string | null };
  connections: Array<{ id: string; status: string }>;
};

export function RelationshipOverview({
  relationships,
  hasMembership,
}: {
  relationships: Relationship[];
  hasMembership: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function requestConnection(id: string) {
    setMessage(null);
    setError(null);
    startTransition(() => {
      void requestOrganizationConnectionFromWarehouseAction(id).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage(`已向 ${result.targetName} 发送企业合作申请`);
        router.refresh();
      });
    });
  }

  function endRelationship(id: string, name: string) {
    if (!window.confirm(`确认结束与「${name}」的任务协作吗？未完成任务会退回待处理队列。`)) return;
    setMessage(null);
    setError(null);
    startTransition(() => {
      void endMyLocationFulfillerRelationshipAction(id).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage("任务协作已结束，历史任务记录会继续保留");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-5">
      {message ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {relationships.length ? (
        <div className="divide-y border-y">
          {relationships.map((relationship) => {
            const active = relationship.status === "ACTIVE";
            const activeConnection = relationship.connections.find(
              (item) => item.status === "ACTIVE"
            );
            const pendingConnection = relationship.connections.find(
              (item) => item.status === "PENDING"
            );
            return (
              <article
                key={relationship.id}
                className="grid gap-5 py-6 lg:grid-cols-[1fr_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{relationship.organization.name}</h2>
                    <Badge variant={active ? "default" : "outline"}>
                      {WAREHOUSE_STATUS_LABELS[relationship.status as WarehouseFulfillerStatus] ??
                        relationship.status}
                    </Badge>
                    <Badge variant="secondary">
                      {WAREHOUSE_ROLE_LABELS[relationship.role as WarehouseFulfillerRole] ??
                        relationship.role}
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    {relationship.location.name} · {relationship.location.code}
                    {relationship.location.region ? ` · ${relationship.location.region}` : ""}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <span className="flex items-center gap-1.5">
                      {active ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <PauseCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      {active ? "之后的新任务仍会出现在这里" : "当前不会再收到新任务"}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock3 className="h-4 w-4" />
                      待处理 {active ? relationship.pendingTaskCount : 0}
                    </span>
                  </div>
                  <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">
                    当前协作范围是这个仓库，不代表你加入了对方企业，也不会开放采购成本和其他库存。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:max-w-xs lg:justify-end">
                  {active ? (
                    <Button asChild size="sm">
                      <Link href="/collaboration/tasks">查看我的任务</Link>
                    </Button>
                  ) : null}
                  {active && hasMembership && !activeConnection && !pendingConnection ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => requestConnection(relationship.id)}
                    >
                      <Link2 className="h-4 w-4" />
                      申请企业合作
                    </Button>
                  ) : null}
                  {activeConnection ? <Badge variant="outline">企业已连接</Badge> : null}
                  {pendingConnection ? <Badge variant="outline">企业合作待确认</Badge> : null}
                  {active ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      disabled={pending}
                      onClick={() => endRelationship(relationship.id, relationship.location.name)}
                    >
                      结束任务协作
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border-y py-12 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">还没有外部协作关系</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            接受任务邀请后，关系、任务和工作记录会统一显示在这里。
          </p>
        </div>
      )}
    </div>
  );
}

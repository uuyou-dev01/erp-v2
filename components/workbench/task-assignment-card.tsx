"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignWorkTaskAction } from "@/app/actions/tasks";
import type { WorkItem } from "@/lib/application/next-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";

export interface AssignableMemberOption {
  id: string;
  name: string;
  email: string;
  role: string;
  relationship: "MEMBER" | "WAREHOUSE_COLLABORATOR";
  locationIds: string[];
  defaultLocationIds: string[];
}

export function TaskAssignmentCard({
  item,
  members,
  onAssigned,
}: {
  item: WorkItem | null;
  members: AssignableMemberOption[];
  onAssigned?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [assigneeId, setAssigneeId] = useState(item?.taskAssignedToId ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAssigneeId(item?.taskAssignedToId ?? "");
    setError(null);
  }, [item?.taskId, item?.taskAssignedToId]);

  if (!item?.taskId) return null;

  const currentAssignee = members.find((member) => member.id === item.taskAssignedToId);
  const fulfillmentLocationIds = item.taskFulfillmentLocationIds?.length
    ? item.taskFulfillmentLocationIds
    : item.taskFulfillmentLocationId
      ? [item.taskFulfillmentLocationId]
      : [];
  const eligibleMembers = fulfillmentLocationIds.length
    ? members.filter((member) =>
        fulfillmentLocationIds.every((locationId) => member.locationIds.includes(locationId))
      )
    : members.filter((member) => member.relationship === "MEMBER");
  const fulfillmentLocationLabel = item.taskFulfillmentLocationNames?.length
    ? item.taskFulfillmentLocationNames.join("、")
    : item.taskFulfillmentLocationName;

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">任务委托</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {fulfillmentLocationLabel
              ? `仅显示具备 ${fulfillmentLocationLabel} 对应任务权限的人员。`
              : "指派后，对方会收到站内通知并可在“我的任务”中看到。"}
          </p>
        </div>
        <Badge variant="outline">
          {currentAssignee?.name ?? item.taskAssignedToName ?? "待指派"}
        </Badge>
      </div>
      <div className="flex gap-2">
        <Select
          value={assigneeId}
          onChange={(event) => {
            setError(null);
            setAssigneeId(event.target.value);
          }}
          className="h-9"
        >
          <option value="">选择任务负责人</option>
          {eligibleMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name || member.email}
              {fulfillmentLocationIds.length === 1 &&
              member.defaultLocationIds.includes(fulfillmentLocationIds[0])
                ? "（默认）"
                : member.relationship === "WAREHOUSE_COLLABORATOR"
                  ? "（外部任务协作）"
                  : ""}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={pending || !assigneeId || assigneeId === item.taskAssignedToId}
          onClick={() => {
            startTransition(async () => {
              try {
                setError(null);
                const result = await assignWorkTaskAction(item.taskId!, assigneeId);
                if (!result.success) {
                  setError(result.error);
                  return;
                }
                router.refresh();
                onAssigned?.();
              } catch (error) {
                setError(error instanceof Error ? error.message : "指派失败");
              }
            });
          }}
        >
          {pending ? "保存中" : "指派"}
        </Button>
      </div>
      {error ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
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

  if (!item?.taskId) return null;

  const currentAssignee = members.find((member) => member.id === item.taskAssignedToId);

  return (
    <section className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-foreground">任务委托</p>
          <p className="mt-1 text-xs text-muted-foreground">
            指派后，对方会收到站内通知并可在“我的任务”中看到。
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
          <option value="">选择负责人</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
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

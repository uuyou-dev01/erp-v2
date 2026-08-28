"use client";

import { useState, useTransition } from "react";
import { UserRoundCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { assignMobileTaskAction, startMobileTaskAction } from "@/app/actions/mobile";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ensureMobileDeviceRegistered } from "@/lib/mobile/client-device";

interface Member {
  id: string;
  name: string | null;
  email: string;
}

export function MobileTaskAssignment({
  workItemId,
  assignedToId,
  assignedToName,
  currentUserId,
  taskStatus,
  members,
}: {
  workItemId: string;
  assignedToId: string | null;
  assignedToName: string | null;
  currentUserId: string;
  taskStatus: string | null;
  members: Member[];
}) {
  const router = useRouter();
  const [assignee, setAssignee] = useState(assignedToId ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");

  return (
    <section className="mb-6 rounded-2xl bg-slate-100/80 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <UserRoundCheck className="h-4 w-4 text-blue-600" />
        {assignedToName ? `负责人：${assignedToName}` : "尚未委托"}
      </div>
      <div className="mt-3 flex gap-2">
        <Select
          aria-label="选择负责人"
          className="h-11 flex-1 rounded-xl bg-white"
          value={assignee}
          onChange={(event) => {
            setAssignee(event.target.value);
            setMessage(null);
          }}
        >
          <option value="">选择负责人</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name || member.email}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl bg-white px-4"
          disabled={!assignee || pending || assignee === assignedToId}
          onClick={() =>
            startTransition(async () => {
              try {
                await ensureMobileDeviceRegistered();
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "设备绑定失败");
                return;
              }
              const result = await assignMobileTaskAction(workItemId, assignee, { dueAt, note });
              if (!result.success) {
                setMessage(result.error);
                return;
              }
              setMessage("已委托并通知对方");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "委托"}
        </Button>
      </div>
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer select-none">添加截止时间和说明</summary>
        <div className="mt-3 grid gap-2">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3"
          />
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="例如：到货后请拍照"
            className="h-10 rounded-xl border border-slate-200 bg-white px-3"
          />
        </div>
      </details>
      {message ? <p className="mt-2 text-xs text-slate-500">{message}</p> : null}
      {!assignedToId || (assignedToId === currentUserId && taskStatus === "ASSIGNED") ? (
        <button
          type="button"
          className="mt-3 text-xs font-semibold text-blue-700"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await ensureMobileDeviceRegistered();
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "设备绑定失败");
                return;
              }
              const result = await startMobileTaskAction(workItemId);
              if (!result.success) {
                setMessage(result.error);
                return;
              }
              setMessage(assignedToId ? "任务已开始处理" : "任务已领取并开始处理");
              router.refresh();
            })
          }
        >
          {assignedToId ? "开始处理" : "领取并开始处理"}
        </button>
      ) : null}
    </section>
  );
}

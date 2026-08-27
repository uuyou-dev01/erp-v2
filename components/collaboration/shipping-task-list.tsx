"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  claimCollaborationShippingTaskAction,
  completeCollaborationShippingTaskAction,
  declineCollaborationShippingTaskAction,
  returnCollaborationShippingTaskAction,
  transferCollaborationShippingTaskAction,
  withdrawCollaborationShippingTaskAction,
} from "@/app/actions/collaboration-tasks";
import type { CollaborationShippingTask } from "@/lib/application/collaboration-shipping-tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowRightLeft,
  Box,
  CheckCircle2,
  MapPin,
  PackageCheck,
  RotateCcw,
  Settings2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type WarehouseTaskView = Omit<CollaborationShippingTask, "assigneeName"> & {
  assigneeName: string | null;
  assignedToId?: string | null;
  isAssignedToMe?: boolean;
  isCreatedByMe?: boolean;
  isHandoffOffer?: boolean;
  transferCandidates?: Array<{ id: string; name: string; email: string }>;
};

type WorkbenchQueue = "claimable" | "processing" | "created" | "completed";

const OUTCOME_MESSAGES: Record<string, string> = {
  claimed: "任务已领取，可以开始填写发货结果。",
  returned: "任务已退回委托方。",
  transferred: "任务已转交给新的仓库负责人。",
  transfer_pending: "转交请求已发送；对方接受前仍由当前执行人负责。",
  handoff_accepted: "转交已接受，现在由你负责这项任务。",
  declined: "已从你的待领取列表移除，其他仓库协作者仍可领取。",
  withdrawn: "任务已撤回。",
  already_claimed: "任务已被领取或状态已经变化，列表已刷新。",
  already_returned: "任务已经退回或转交，列表已刷新。",
  already_withdrawn: "任务已经撤回。",
  completed: "任务已经完成，无需再次操作。",
};

export function ShippingTaskList({
  tasks,
  mode = "portal",
}: {
  tasks: WarehouseTaskView[];
  mode?: "portal" | "workbench";
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initialTask = params.get("task");
  const initialIsCompleted = tasks.some(
    (task) => task.id === initialTask && task.status === "DONE"
  );
  const initialTaskValue = tasks.find((task) => task.id === initialTask);
  const [view, setView] = useState<"active" | "completed" | WorkbenchQueue>(() => {
    if (mode === "portal") return initialIsCompleted ? "completed" : "active";
    if (initialTaskValue?.status === "DONE") return "completed";
    if (initialTaskValue?.isCreatedByMe) return "created";
    if (initialTaskValue?.status === "IN_PROGRESS") return "processing";
    return "claimable";
  });
  const visibleTasks = useMemo(() => {
    if (mode === "portal") {
      return tasks.filter((task) =>
        view === "completed" ? task.status === "DONE" : task.status !== "DONE"
      );
    }
    return tasks.filter((task) => {
      if (view === "claimable") {
        return task.isAssignedToMe !== false && ["ASSIGNED", "OVERDUE"].includes(task.status);
      }
      if (view === "processing") {
        return task.isAssignedToMe !== false && task.status === "IN_PROGRESS";
      }
      if (view === "created") return task.isCreatedByMe === true;
      return task.status === "DONE" && (task.isAssignedToMe !== false || task.isCreatedByMe);
    });
  }, [mode, tasks, view]);
  const [selectedId, setSelectedId] = useState(
    initialTask || (mode === "portal" ? visibleTasks[0]?.id : "") || ""
  );
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const selected = useMemo(
    () =>
      visibleTasks.find((task) => task.id === selectedId) ||
      (mode === "portal" ? visibleTasks[0] : undefined),
    [mode, selectedId, visibleTasks]
  );
  const initialProof = selected?.order.shippingProof;
  const [form, setForm] = useState({
    trackingNo: selected?.order.trackingNo || "",
    shipper: initialProof?.shipper || selected?.assigneeName || "",
    shippingMethod: initialProof?.shippingMethod || "",
    pickupCode: initialProof?.pickupCode || "",
    proofNote: initialProof?.proofNote || "",
    imageUrls: initialProof?.imageUrls || ([] as string[]),
  });

  useEffect(() => {
    if (!selected) return;
    setTransferTargetId("");
    setWithdrawReason("");
    setForm({
      trackingNo: selected.order.trackingNo || "",
      shipper: selected.order.shippingProof.shipper || selected.assigneeName || "",
      shippingMethod: selected.order.shippingProof.shippingMethod || "",
      pickupCode: selected.order.shippingProof.pickupCode || "",
      proofNote: selected.order.shippingProof.proofNote || "",
      imageUrls: selected.order.shippingProof.imageUrls || [],
    });
  }, [selected]);

  function choose(task: WarehouseTaskView) {
    setSelectedId(task.id);
    setError(null);
    setNotice(null);
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "图片上传失败");
      setForm((value) => ({ ...value, imageUrls: [...value.imageUrls, result.url] }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "图片上传失败");
    } finally {
      setUploading(false);
    }
  }

  function run(
    action: () => Promise<{ success: boolean; error?: string; outcome?: string }>,
    fallbackNotice?: string
  ) {
    setError(null);
    setNotice(null);
    startTransition(() => {
      void action().then((result) => {
        if (!result.success) return setError(result.error || "操作失败");
        setNotice(
          (result.outcome && OUTCOME_MESSAGES[result.outcome]) || fallbackNotice || "操作成功"
        );
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-muted p-1" aria-label="任务范围">
        {(mode === "workbench"
          ? [
              {
                value: "claimable" as const,
                label: "待领取",
                count: tasks.filter(
                  (task) =>
                    task.isAssignedToMe !== false && ["ASSIGNED", "OVERDUE"].includes(task.status)
                ).length,
              },
              {
                value: "processing" as const,
                label: "处理中",
                count: tasks.filter(
                  (task) => task.isAssignedToMe !== false && task.status === "IN_PROGRESS"
                ).length,
              },
              {
                value: "created" as const,
                label: "我发起",
                count: tasks.filter((task) => task.isCreatedByMe).length,
              },
              {
                value: "completed" as const,
                label: "已完成",
                count: tasks.filter(
                  (task) =>
                    task.status === "DONE" && (task.isAssignedToMe !== false || task.isCreatedByMe)
                ).length,
              },
            ]
          : [
              {
                value: "active" as const,
                label: "待处理",
                count: tasks.filter((task) => task.status !== "DONE").length,
              },
              {
                value: "completed" as const,
                label: "已完成",
                count: tasks.filter((task) => task.status === "DONE").length,
              },
            ]
        ).map((item) => (
          <Button
            key={item.value}
            type="button"
            size="sm"
            variant={view === item.value ? "secondary" : "ghost"}
            onClick={() => {
              setView(item.value);
              setSelectedId("");
              setError(null);
              setNotice(null);
            }}
          >
            {item.label} ({item.count})
          </Button>
        ))}
      </div>

      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {visibleTasks.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <h2 className="mt-4 text-lg font-semibold">
            {view === "active" || view === "claimable"
              ? "当前没有待领取任务"
              : view === "processing"
                ? "当前没有处理中的任务"
                : view === "created"
                  ? "还没有发起仓库任务"
                  : "还没有已完成记录"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "active" || view === "claimable"
              ? "委托方派发新任务后会在这里出现。"
              : view === "processing"
                ? "领取任务后会进入这里。"
                : view === "created"
                  ? "从订单任务中委托仓库协作者后会显示在这里。"
                  : "完成的协作任务会长期保留在这里。"}
          </p>
        </div>
      ) : (
        <div className={cn("grid gap-5", mode === "portal" && "lg:grid-cols-[320px_1fr]")}>
          <aside
            className={cn(
              "space-y-2",
              mode === "workbench" && "grid gap-3 space-y-0 sm:grid-cols-2 xl:grid-cols-3"
            )}
          >
            {visibleTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => choose(task)}
                className={`w-full rounded-lg border p-4 text-left transition ${
                  task.id === selected?.id
                    ? "border-primary bg-primary/5"
                    : "bg-card hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{task.order.orderNumber}</span>
                  <Badge variant={task.status === "IN_PROGRESS" ? "default" : "outline"}>
                    {task.status === "DONE"
                      ? "已完成"
                      : task.status === "CANCELLED"
                        ? "已撤回"
                        : task.status === "OPEN"
                          ? "待重新指派"
                          : task.status === "IN_PROGRESS"
                            ? "处理中"
                            : "待领取"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{task.location.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {task.order.lines.length} 种商品
                </p>
              </button>
            ))}
          </aside>

          {mode === "workbench" && selected ? (
            <button
              type="button"
              aria-label="关闭仓库任务详情"
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setSelectedId("")}
            />
          ) : null}
          {selected ? (
            <main
              className={cn(
                "space-y-5 rounded-xl border bg-card p-5 md:p-7",
                mode === "workbench" &&
                  "fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto rounded-none shadow-xl"
              )}
            >
              {mode === "workbench" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="关闭仓库任务详情"
                  className="absolute right-3 top-3"
                  onClick={() => setSelectedId("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
                <div>
                  <p className="text-xs text-muted-foreground">{selected.organizationName} 委托</p>
                  <h2 className="mt-1 text-xl font-semibold">订单 {selected.order.orderNumber}</h2>
                  <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" /> 来源仓库：{selected.location.name} ·{" "}
                    {selected.location.code}
                  </p>
                </div>
                {selected.status === "DONE" ? (
                  <Badge variant="secondary">
                    已于{" "}
                    {selected.completedAt
                      ? new Date(selected.completedAt).toLocaleString("zh-CN")
                      : "—"}{" "}
                    完成
                  </Badge>
                ) : selected.status === "CANCELLED" ? (
                  <Badge variant="outline">任务已撤回</Badge>
                ) : selected.status === "OPEN" ? (
                  <Badge variant="outline">仓库队列待领取</Badge>
                ) : selected.isAssignedToMe !== false && selected.status !== "IN_PROGRESS" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => claimCollaborationShippingTaskAction(selected.id))}
                    >
                      <PackageCheck className="h-4 w-4" />
                      {selected.isHandoffOffer ? "接受转交" : "领取并开始"}
                    </Button>
                    {!selected.isHandoffOffer ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => declineCollaborationShippingTaskAction(selected.id))
                        }
                      >
                        暂不领取
                      </Button>
                    ) : null}
                  </div>
                ) : selected.isAssignedToMe !== false ? (
                  <Badge>正在处理</Badge>
                ) : (
                  <Badge variant="outline">
                    {selected.status === "IN_PROGRESS"
                      ? `${selected.assigneeName || "仓库负责人"} 处理中`
                      : `已指派给 ${selected.assigneeName || "仓库负责人"}`}
                  </Badge>
                )}
              </div>

              {mode === "workbench" ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/inventory/locations/${selected.location.id}?returnTo=${encodeURIComponent(`/workbench?scope=warehouse&task=${selected.id}`)}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    仓库设置
                  </Link>
                  <Link
                    href={`/inventory/stocktake?locationId=${encodeURIComponent(selected.location.id)}&returnTo=${encodeURIComponent(`/workbench?scope=warehouse&task=${selected.id}`)}`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted"
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    库存调整
                  </Link>
                </div>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold">收件信息</h3>
                <div className="mt-2 rounded-lg bg-muted/40 p-4 text-sm leading-6">
                  {selected.order.recipientVisible ? (
                    <>
                      <p>{selected.order.customerName}</p>
                      {selected.order.customerPhone ? <p>{selected.order.customerPhone}</p> : null}
                      <p>{selected.order.shippingAddress || "未填写收件地址"}</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">
                      为保护客户隐私，接受任务后才会显示姓名、电话和收货地址。
                    </p>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold">库存明细</h3>
                <div className="mt-2 divide-y rounded-lg border">
                  {selected.order.lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-3 p-3">
                      {line.sku.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.sku.imageUrl}
                          alt=""
                          className="h-12 w-12 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">
                          <Box className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{line.sku.name}</p>
                        <p className="text-xs text-muted-foreground">{line.sku.code}</p>
                      </div>
                      <p className="font-medium">× {line.quantity}</p>
                    </div>
                  ))}
                </div>
              </section>

              {mode === "workbench" &&
              selected.status !== "DONE" &&
              selected.status !== "CANCELLED" ? (
                <section className="space-y-3 border-t pt-5" aria-label="任务协作操作">
                  <div className="flex flex-wrap gap-2">
                    {selected.isAssignedToMe !== false && selected.status === "IN_PROGRESS" ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => returnCollaborationShippingTaskAction(selected.id))
                        }
                      >
                        <RotateCcw className="h-4 w-4" />
                        退回任务
                      </Button>
                    ) : null}
                    {selected.isCreatedByMe ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            withdrawCollaborationShippingTaskAction(
                              selected.id,
                              withdrawReason || undefined
                            )
                          )
                        }
                      >
                        <Undo2 className="h-4 w-4" />
                        撤回任务
                      </Button>
                    ) : null}
                  </div>
                  {selected.isCreatedByMe && selected.status === "IN_PROGRESS" ? (
                    <Input
                      value={withdrawReason}
                      onChange={(event) => setWithdrawReason(event.target.value)}
                      placeholder="撤回处理中任务时请填写原因"
                      aria-label="撤回原因"
                    />
                  ) : null}
                  {selected.status === "IN_PROGRESS" && selected.transferCandidates?.length ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="转交给"
                        value={transferTargetId}
                        onChange={(event) => setTransferTargetId(event.target.value)}
                      >
                        <option value="">选择新的仓库负责人</option>
                        {selected.transferCandidates
                          .filter((candidate) => candidate.id !== selected.assignedToId)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name}
                            </option>
                          ))}
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending || !transferTargetId}
                        onClick={() =>
                          run(() =>
                            transferCollaborationShippingTaskAction(selected.id, transferTargetId)
                          )
                        }
                      >
                        转交任务
                      </Button>
                    </div>
                  ) : null}
                </section>
              ) : null}

              {error ? (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" /> {error}
                </p>
              ) : null}

              {selected.status === "IN_PROGRESS" && selected.isAssignedToMe !== false ? (
                <form
                  className="space-y-4 border-t pt-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(() => completeCollaborationShippingTaskAction(selected.id, form));
                  }}
                >
                  <h3 className="text-sm font-semibold">回填发货结果</h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>发货人</Label>
                      <Input
                        value={form.shipper}
                        onChange={(e) => setForm({ ...form, shipper: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>承运商 / 发货方式</Label>
                      <Input
                        value={form.shippingMethod}
                        onChange={(e) => setForm({ ...form, shippingMethod: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>运单号</Label>
                      <Input
                        value={form.trackingNo}
                        onChange={(e) => setForm({ ...form, trackingNo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>取件码 / 交接码</Label>
                      <Input
                        value={form.pickupCode}
                        onChange={(e) => setForm({ ...form, pickupCode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>凭证和备注</Label>
                    <Textarea
                      value={form.proofNote}
                      onChange={(e) => setForm({ ...form, proofNote: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                      <Upload className="h-4 w-4" /> {uploading ? "上传中" : "上传发货凭证"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        className="sr-only"
                        disabled={uploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void upload(file);
                          event.target.value = "";
                        }}
                      />
                    </Label>
                    {form.imageUrls.length ? (
                      <div className="flex flex-wrap gap-2">
                        {form.imageUrls.map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt="发货凭证"
                            className="h-16 w-16 rounded border object-cover"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button type="submit" className="w-full" disabled={pending || uploading}>
                    {pending ? "正在提交" : "确认已发货并回写订单"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    确认后会扣减该订单库存并通知委托人。
                  </p>
                </form>
              ) : selected.status === "DONE" ? (
                <div className="rounded-lg border bg-muted/30 p-5 text-sm">
                  <p className="font-medium">这项工作已经计入工作记录</p>
                  <p className="mt-1 text-muted-foreground">
                    委托企业、执行账号、仓库和完成时间均已固化，可供后续工作量汇总与对账。
                  </p>
                </div>
              ) : selected.status === "CANCELLED" ? (
                <div className="rounded-lg border bg-muted/30 p-5 text-sm">
                  <p className="font-medium">任务已撤回</p>
                  <p className="mt-1 text-muted-foreground">
                    此结果会保留在“我发起”中，仓库协作者不再需要处理。
                  </p>
                </div>
              ) : selected.isAssignedToMe !== false ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
                  接受任务后才能填写物流信息和上传发货凭证。
                </div>
              ) : null}
            </main>
          ) : null}
        </div>
      )}
    </div>
  );
}

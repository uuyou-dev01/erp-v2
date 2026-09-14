"use client";
import { showActionSuccess } from "@/components/feedback/action-feedback";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  claimCollaborationShippingTaskAction,
  saveCollaborationShippingPreparationAction,
  assignCollaborationShippingTaskAction,
  completeCollaborationShippingTaskAction,
  declineCollaborationShippingTaskAction,
  returnCollaborationShippingTaskAction,
  transferCollaborationShippingTaskAction,
  withdrawCollaborationShippingTaskAction,
} from "@/app/actions/collaboration-tasks";
import type { CollaborationShippingTask } from "@/lib/application/collaboration-shipping-tasks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  ArrowRightLeft,
  Box,
  Camera,
  Clock3,
  CheckCircle2,
  Layers3,
  MapPin,
  PackageCheck,
  RotateCcw,
  Settings2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getShippingTaskTiming } from "@/lib/application/shipping-task-timing";

type WarehouseTaskView = Omit<CollaborationShippingTask, "assigneeName"> & {
  assigneeName: string | null;
  assignedToId?: string | null;
  isAssignedToMe?: boolean;
  isCreatedByMe?: boolean;
  isHandoffOffer?: boolean;
  canDispatch?: boolean;
  transferCandidates?: Array<{ id: string; name: string; email: string }>;
};

type WorkbenchQueue = "claimable" | "processing" | "created" | "completed";

const OUTCOME_MESSAGES: Record<string, string> = {
  claimed: "任务已领取，可以开始填写发货结果。",
  returned: "任务已退回委托方。",
  transferred: "任务已转交给新的任务负责人。",
  assigned: "任务已指派，等待对方领取。",
  transfer_pending: "转交请求已发送；对方接受前仍由当前执行人负责。",
  handoff_accepted: "转交已接受，现在由你负责这项任务。",
  declined: "已从你的待领取列表移除，其他任务协作者仍可领取。",
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
  const [shipmentChecked, setShipmentChecked] = useState(false);
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
  const selectedTiming = selected
    ? getShippingTaskTiming({
        createdAt: selected.createdAt,
        dueAt: selected.dueAt,
        completedAt: selected.completedAt,
        status: selected.status,
      })
    : null;
  const selectedTotalQuantity = selected?.order.lines.reduce(
    (total, line) => total + Number(line.quantity),
    0
  );

  useEffect(() => {
    if (!selected) return;
    setTransferTargetId("");
    setWithdrawReason("");
    setShipmentChecked(false);
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
    if (uploading || pending) return;
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
      data.append("purpose", "BUSINESS_EVIDENCE");
      if (selected) data.append("taskId", selected.id);
      const response = await fetch("/api/upload", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "图片上传失败");
      setForm((value) => ({ ...value, imageUrls: [...value.imageUrls, result.url] }));
      if (selected) {
        const saved = await saveCollaborationShippingPreparationAction(selected.id, {
          imageUrls: [result.url],
        });
        if (!saved.success) throw new Error(saved.error);
        setForm((value) => ({ ...value, imageUrls: saved.imageUrls }));
        setNotice("发货前资料已保存并通知货主，订单仍为待发货。");
        showActionSuccess("发货前资料已保存，尚未确认发货。");
      }
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
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) return setError(result.error || "操作失败");
        showActionSuccess(
          (result.outcome && OUTCOME_MESSAGES[result.outcome]) || fallbackNotice || "操作成功"
        );
        setNotice(
          (result.outcome && OUTCOME_MESSAGES[result.outcome]) || fallbackNotice || "操作成功"
        );
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "操作失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-4">
      {tasks.some((task) => task.canDispatch) ? (
        <div className="flex flex-col gap-2 border-y bg-muted/20 px-1 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">任务负责人视图</p>
            <p className="mt-1 text-xs text-muted-foreground">
              可指派本仓库任务；客户地址仅当前执行人可见。
            </p>
          </div>
          <div className="flex gap-4 text-sm tabular-nums">
            <span>
              待领取{" "}
              {tasks.filter((task) => ["OPEN", "ASSIGNED", "OVERDUE"].includes(task.status)).length}
            </span>
            <span>处理中 {tasks.filter((task) => task.status === "IN_PROGRESS").length}</span>
          </div>
        </div>
      ) : null}
      <div className="inline-flex rounded-xl border bg-muted/70 p-1.5" aria-label="任务范围">
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
            variant="ghost"
            className={cn(
              "min-w-[7rem] rounded-lg px-3 font-medium",
              view === item.value &&
                "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground"
            )}
            disabled={uploading || pending}
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
                  ? "还没有发起协作任务"
                  : "还没有已完成记录"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {view === "active" || view === "claimable"
              ? "委托方派发新任务后会在这里出现。"
              : view === "processing"
                ? "领取任务后会进入这里。"
                : view === "created"
                  ? "从订单中委托任务协作者后会显示在这里。"
                  : "完成的协作任务会长期保留在这里。"}
          </p>
        </div>
      ) : (
        <div
          className={cn(
            "grid min-w-0 grid-cols-1 items-start gap-5",
            mode === "portal" && "lg:grid-cols-[320px_minmax(0,1fr)]"
          )}
        >
          <aside
            className={cn(
              "space-y-2",
              mode === "workbench" && "grid gap-3 space-y-0 sm:grid-cols-2 xl:grid-cols-3"
            )}
          >
            {visibleTasks.map((task) => {
              const timing = getShippingTaskTiming({
                createdAt: task.createdAt,
                dueAt: task.dueAt,
                completedAt: task.completedAt,
                status: task.status,
              });
              const totalQuantity = task.order.lines.reduce(
                (total, line) => total + Number(line.quantity),
                0
              );
              const firstLine = task.order.lines[0];

              return (
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {firstLine?.sku.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={firstLine.sku.imageUrl}
                          alt={`${firstLine.sku.name} 商品图`}
                          className="h-14 w-14 shrink-0 rounded-md border bg-background object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted">
                          <Box className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {firstLine?.sku.name ?? "待核对商品"}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {firstLine?.sku.code ?? task.order.orderNumber}
                          {firstLine?.sku.variantLabel ? ` · ${firstLine.sku.variantLabel}` : ""}
                        </p>
                        <p className="mt-1 text-sm font-medium tabular-nums">
                          {task.order.lines.length} 种，共 {totalQuantity} 件
                        </p>
                        {task.isBundleSale ? (
                          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-violet-700">
                            <Layers3 className="h-3 w-3" />
                            合并发货 · 同一包裹
                          </p>
                        ) : null}
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          订单 {task.order.orderNumber}
                        </p>
                      </div>
                    </div>
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
                  <div className="mt-3 flex items-end justify-between gap-3 border-t pt-3">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          timing.tone === "overdue" && "text-destructive",
                          timing.tone === "warning" && "text-amber-700",
                          timing.tone === "completed" && "text-emerald-700"
                        )}
                      >
                        {timing.urgencyLabel}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {timing.scheduleLabel}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {task.location.name}
                    </span>
                  </div>
                </button>
              );
            })}
          </aside>

          {mode === "workbench" && selected ? (
            <button
              type="button"
              aria-label="关闭任务详情"
              className="fixed inset-0 z-40 bg-black/20"
              onClick={() => setSelectedId("")}
            />
          ) : null}
          {selected ? (
            <main
              className={cn(
                "min-w-0 max-w-full space-y-5 rounded-xl border bg-card p-3 [overflow-wrap:anywhere] sm:p-5 md:p-7",
                mode === "workbench" &&
                  "fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto rounded-none shadow-xl"
              )}
            >
              {mode === "workbench" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="关闭任务详情"
                  className="absolute right-3 top-3"
                  onClick={() => setSelectedId("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(selected.isBundleSale && "bg-violet-100 text-violet-800")}
                    >
                      {selected.isBundleSale ? "合并发货" : "订单发货"}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {selected.organizationName} 委托
                    </p>
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">
                    {selected.isBundleSale ? "合并发货" : "订单"} {selected.order.orderNumber}
                  </h2>
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
                      ? `${selected.assigneeName || "任务负责人"} 处理中`
                      : `已指派给 ${selected.assigneeName || "任务负责人"}`}
                  </Badge>
                )}
              </div>

              {selectedTiming ? (
                <section
                  aria-label="发货时限"
                  className={cn(
                    "flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
                    selectedTiming.tone === "overdue" && "border-destructive/30 bg-destructive/5",
                    selectedTiming.tone === "warning" && "border-amber-200 bg-amber-50/60",
                    selectedTiming.tone === "completed" && "border-emerald-200 bg-emerald-50/60"
                  )}
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Clock3
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground",
                        selectedTiming.tone === "overdue" && "text-destructive",
                        selectedTiming.tone === "warning" && "text-amber-700",
                        selectedTiming.tone === "completed" && "text-emerald-700"
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{selectedTiming.scheduleLabel}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {selectedTiming.createdLabel}
                      </p>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-lg font-semibold tabular-nums",
                      selectedTiming.tone === "overdue" && "text-destructive",
                      selectedTiming.tone === "warning" && "text-amber-700",
                      selectedTiming.tone === "completed" && "text-emerald-700"
                    )}
                  >
                    {selectedTiming.urgencyLabel}
                  </p>
                </section>
              ) : null}

              <section aria-labelledby="shipping-products-title">
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 id="shipping-products-title" className="text-base font-semibold">
                      先核对商品
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selected.isBundleSale
                        ? "这些商品属于同一个包裹，请按图片、SKU 和数量逐项取齐后一起发出。"
                        : "按图片、SKU 和数量逐项取货，确认无误后再发出。"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    {selected.order.lines.length} 种，共 {selectedTotalQuantity ?? 0} 件
                  </span>
                </div>
                <div className="divide-y rounded-lg border">
                  {selected.order.lines.map((line) => (
                    <div key={line.id} className="flex items-center gap-3 p-3">
                      {line.sku.imageUrl ? (
                        <a
                          href={line.sku.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`查看 ${line.sku.name} 商品原图`}
                          className="shrink-0 rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={line.sku.imageUrl}
                            alt={`${line.sku.name} 商品图`}
                            className="h-14 w-14 rounded-md border bg-background object-cover sm:h-20 sm:w-20"
                          />
                        </a>
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border bg-muted sm:h-20 sm:w-20">
                          <Box className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{line.sku.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          SKU {line.sku.code}
                          {line.sku.variantLabel ? ` · ${line.sku.variantLabel}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-lg font-semibold tabular-nums">
                        × {line.quantity}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="border-y py-4" aria-labelledby="shipping-proof-title">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 id="shipping-proof-title" className="text-base font-semibold">
                      发货前资料
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      双方可提供二维码、付款码或取件截图。拍照上传后立即保存并通知货主，点击图片可查看原图；实际寄出后再确认发货。
                    </p>
                  </div>
                  {selected.status === "IN_PROGRESS" && selected.isAssignedToMe !== false ? (
                    <div className="flex flex-wrap gap-2">
                      <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Camera className="h-4 w-4" />
                        拍照上传
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          aria-label="拍摄发货前资料"
                          className="sr-only"
                          disabled={uploading || pending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void upload(file);
                            event.target.value = "";
                          }}
                        />
                      </Label>
                      <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Upload className="h-4 w-4" /> {uploading ? "上传并保存中" : "从相册上传"}
                        <input
                          type="file"
                          accept="image/*"
                          aria-label="选择发货前资料图片"
                          className="sr-only"
                          disabled={uploading || pending}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) void upload(file);
                            event.target.value = "";
                          }}
                        />
                      </Label>
                    </div>
                  ) : null}
                </div>
                {form.imageUrls.length ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {form.imageUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="查看发货前资料原图"
                        className="block rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="发货前资料"
                          className="h-24 w-24 rounded-md border bg-background object-contain sm:h-28 sm:w-28"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-md bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
                    {selected.order.recipientVisible
                      ? "尚未添加发货前资料。货主和发货方都可以补充二维码或取件截图。"
                      : "领取任务后可查看委托方提供的发货前资料。"}
                  </p>
                )}
                {selected.status === "IN_PROGRESS" && selected.isAssignedToMe !== false ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3"
                    disabled={pending || uploading}
                    onClick={() =>
                      run(
                        () =>
                          saveCollaborationShippingPreparationAction(selected.id, {
                            imageUrls: form.imageUrls,
                            proofNote: form.proofNote,
                          }),
                        "发货前资料已保存并通知货主，订单仍为待发货。"
                      )
                    }
                  >
                    保存发货前资料
                  </Button>
                ) : null}
              </section>

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

              {selected.status !== "DONE" && selected.status !== "CANCELLED" ? (
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
                    {selected.isCreatedByMe || selected.canDispatch ? (
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
                  {(selected.isCreatedByMe || selected.canDispatch) &&
                  selected.status === "IN_PROGRESS" ? (
                    <Input
                      value={withdrawReason}
                      onChange={(event) => setWithdrawReason(event.target.value)}
                      placeholder="撤回处理中任务时请填写原因"
                      aria-label="撤回原因"
                    />
                  ) : null}
                  {selected.canDispatch &&
                  ["OPEN", "ASSIGNED", "OVERDUE"].includes(selected.status) &&
                  selected.transferCandidates?.length ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="指派给"
                        value={transferTargetId}
                        onChange={(event) => setTransferTargetId(event.target.value)}
                      >
                        <option value="">选择任务协作者</option>
                        {selected.transferCandidates.map((candidate) => (
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
                            assignCollaborationShippingTaskAction(selected.id, transferTargetId)
                          )
                        }
                      >
                        指派任务
                      </Button>
                    </div>
                  ) : null}
                  {selected.status === "IN_PROGRESS" &&
                  selected.transferCandidates?.length &&
                  (selected.isAssignedToMe !== false || selected.canDispatch) ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select
                        aria-label="转交给"
                        value={transferTargetId}
                        onChange={(event) => setTransferTargetId(event.target.value)}
                      >
                        <option value="">选择新的任务负责人</option>
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
                    run(
                      () => completeCollaborationShippingTaskAction(selected.id, form),
                      "已确认发货，库存已更新并通知货主。"
                    );
                  }}
                >
                  <h3 className="text-sm font-semibold">回填发货结果</h3>
                  <p className="text-xs text-muted-foreground">
                    以下信息均为选填；确认提交本身会完成发货并扣减已分配库存。
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>现场交接联系人（选填）</Label>
                      <Input
                        value={form.shipper}
                        onChange={(e) => setForm({ ...form, shipper: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>承运商 / 发货方式（选填）</Label>
                      <Input
                        value={form.shippingMethod}
                        onChange={(e) => setForm({ ...form, shippingMethod: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>运单号（选填）</Label>
                      <Input
                        value={form.trackingNo}
                        onChange={(e) => setForm({ ...form, trackingNo: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>取件码 / 交接码（选填）</Label>
                      <Input
                        value={form.pickupCode}
                        onChange={(e) => setForm({ ...form, pickupCode: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>凭证和备注（选填）</Label>
                    <Textarea
                      value={form.proofNote}
                      onChange={(e) => setForm({ ...form, proofNote: e.target.value })}
                    />
                  </div>
                  <div className="rounded-lg border bg-muted/25 p-3">
                    <p className="mb-2 text-sm font-medium">发货确认（必选）</p>
                    <Checkbox
                      checked={shipmentChecked}
                      onChange={(event) => setShipmentChecked(event.target.checked)}
                      label="我已按商品图、SKU、规格和数量核对，确认没有拿错货"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={pending || uploading || !shipmentChecked}
                  >
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
                    此结果会保留在“我发起”中，任务协作者不再需要处理。
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

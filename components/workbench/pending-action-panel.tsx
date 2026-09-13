"use client";

import { showActionSuccess } from "@/components/feedback/action-feedback";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import type { WorkItem } from "@/lib/application/next-actions";
import type { WorkbenchPlatformOption } from "./action-drawer-forms";
import {
  ConfirmArrivalForm,
  CancelOrderSection,
  ConfirmOrderButton,
  CreateListingForm,
  DispositionForm,
  FillLogisticsForm,
  InboundForm,
  OpenDetailLink,
  ResolveQuickEntryExceptionForm,
  ReturnInspectionForm,
  SettleOrderForm,
  ShipOrderForm,
  ShippedOrderForm,
  ShipmentArrivalProcessingForm,
} from "./action-drawer-forms";
import {
  ActionDrawerHeader,
  ActionDrawerLayout,
  ActionFooter,
  ContextSummaryCard,
  PurchaseLinesCard,
  SmartSuggestionPanel,
} from "./action-drawer-layout";
import { getWorkflowActionSpec } from "@/lib/application/workflow-actions";
import { TaskAssignmentCard, type AssignableMemberOption } from "./task-assignment-card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { isActionFailure } from "@/lib/application/action-result";

interface PendingActionPanelProps {
  detail: WorkItemDetail;
  taskItem?: WorkItem | null;
  assignableMembers?: AssignableMemberOption[];
  platforms?: WorkbenchPlatformOption[];
  locations?: Array<{ id: string; code: string; name: string; type: string }>;
  consolidationBatches?: Array<{
    id: string;
    label: string;
    fromLocationId: string | null;
    toLocationId: string | null;
  }>;
  onClose?: () => void;
  onComplete?: () => void;
  compact?: boolean;
}

type PanelNotice = {
  tone: "success" | "error";
  message: string;
  href?: string;
  actionLabel?: string;
};

export function PendingActionPanel({
  detail,
  taskItem = null,
  assignableMembers = [],
  platforms = [],
  locations = [],
  consolidationBatches = [],
  onClose,
  onComplete,
  compact = false,
}: PendingActionPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<PanelNotice | null>(null);
  const actionSpec = getWorkflowActionSpec(detail.primaryAction);
  const detailHref =
    detail.detailHref && detail.detailHref !== "/workbench" ? detail.detailHref : undefined;

  const refresh = () => {
    router.refresh();
    onComplete?.();
  };

  const run = (
    fn: () => Promise<unknown>,
    options?: { keepOpen?: boolean; successMessage?: string; onSuccess?: () => void }
  ) => {
    startTransition(async () => {
      try {
        setNotice(null);
        const result = await fn();
        if (isActionFailure(result)) {
          setNotice({ tone: "error", message: result.error });
          return;
        }
        options?.onSuccess?.();
        showActionSuccess(
          options?.successMessage ??
            (detail.primaryAction === "shipOrder" ? "已确认发货，库存已更新。" : "操作已保存。")
        );
        if (result && typeof result === "object") {
          if (
            detail.primaryAction === "createListing" &&
            "ids" in result &&
            Array.isArray((result as { ids: unknown }).ids)
          ) {
            const created = result as {
              ids: string[];
              skuCode?: string;
              listingPageHref?: string;
            };
            if (created.ids.length > 0) {
              const skuHint = created.skuCode ? `（SKU：${created.skuCode}）` : "";
              const href = created.listingPageHref ?? "/inventory/sellable";
              setNotice({
                tone: "success",
                message: `已添加 ${created.ids.length} 条上架记录${skuHint}。`,
                href,
                actionLabel: "查看可售库存",
              });
              router.refresh();
              return;
            }
          }
          if (
            (detail.primaryAction === "inbound" || detail.primaryAction === "disposition") &&
            "sellablePageHref" in result &&
            typeof (result as { sellablePageHref: string }).sellablePageHref === "string"
          ) {
            const { sellablePageHref } = result as { sellablePageHref: string };
            setNotice({
              tone: "success",
              message: "入库已确认，商品已进入可售库存。",
              href: sellablePageHref,
              actionLabel: "前往可售库存",
            });
            router.refresh();
            return;
          }
          if (
            detail.primaryAction === "disposition" &&
            "inventoryPageHref" in result &&
            typeof (result as { inventoryPageHref: string }).inventoryPageHref === "string"
          ) {
            const { inventoryPageHref } = result as { inventoryPageHref: string };
            setNotice({
              tone: "success",
              message: "转仓已发起，当前库存已锁定并进入真实在途；目标仓需另行确认到货后才会入库。",
              href: inventoryPageHref,
              actionLabel: "查看库存记录",
            });
            router.refresh();
            return;
          }
        }
        if (options?.keepOpen) {
          router.refresh();
          if (options.successMessage) {
            setNotice({ tone: "success", message: options.successMessage });
          }
          return;
        }
        refresh();
      } catch (error) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "操作失败",
        });
      }
    });
  };

  const renderActionForm = () => {
    if (detail.primaryAction === "fillLogistics") {
      return (
        <FillLogisticsForm detail={detail} locations={locations} pending={pending} run={run} />
      );
    }
    if (detail.primaryAction === "confirmArrival" && detail.entityType === "shipment") {
      return (
        <ShipmentArrivalProcessingForm
          detail={detail}
          locations={locations}
          pending={pending}
          run={run}
        />
      );
    }
    if (detail.primaryAction === "confirmArrival" || detail.primaryAction === "receivePurchase") {
      return (
        <ConfirmArrivalForm
          detail={detail}
          locations={locations}
          consolidationBatches={consolidationBatches}
          pending={pending}
          run={run}
        />
      );
    }
    if (detail.primaryAction === "disposition") {
      return (
        <DispositionForm
          detail={detail}
          locations={locations}
          consolidationBatches={consolidationBatches}
          pending={pending}
          run={run}
        />
      );
    }
    if (detail.primaryAction === "inbound")
      return <InboundForm detail={detail} locations={locations} pending={pending} run={run} />;
    if (detail.primaryAction === "createListing") {
      return (
        <CreateListingForm detail={detail} platforms={platforms} pending={pending} run={run} />
      );
    }
    if (detail.primaryAction === "shipOrder") {
      return (
        <ShipOrderForm
          detail={detail}
          taskItem={taskItem}
          pending={pending}
          run={run}
          assignmentPanel={
            <TaskAssignmentCard
              item={taskItem}
              members={assignableMembers}
              onAssigned={onComplete}
            />
          }
        />
      );
    }
    if (detail.primaryAction === "confirmDelivery") {
      return <ShippedOrderForm detail={detail} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "approveReturnInspection") {
      return <ReturnInspectionForm detail={detail} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "settleOrder")
      return <SettleOrderForm detail={detail} pending={pending} run={run} />;
    if (detail.primaryAction === "confirmOrder") {
      return (
        <div className="space-y-4">
          <ConfirmOrderButton detail={detail} pending={pending} run={run} />
          <CancelOrderSection detail={detail} pending={pending} run={run} />
        </div>
      );
    }
    if (detail.primaryAction === "resolveException" || detail.primaryAction === "retryProcess") {
      return detail.entityType === "quickEntry" ? (
        <ResolveQuickEntryExceptionForm
          detail={detail}
          locations={locations}
          pending={pending}
          run={run}
        />
      ) : (
        <OpenDetailLink detail={detail} />
      );
    }
    return <OpenDetailLink detail={detail} />;
  };

  const suggestions = getActionSuggestions(detail);
  const isQuickEntryException =
    detail.entityType === "quickEntry" &&
    (detail.primaryAction === "resolveException" || detail.primaryAction === "retryProcess");
  const isShippingAction = detail.primaryAction === "shipOrder";
  const actionTitle = isQuickEntryException
    ? "补齐录入信息"
    : detail.primaryAction === "viewDetails"
      ? detail.primaryActionLabel
      : actionSpec.title;

  const noticePanel = notice ? (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={
        notice.tone === "error"
          ? "mb-3 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
          : "mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
      }
    >
      <div className="flex items-start gap-2">
        {notice.tone === "error" ? (
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <p>{notice.message}</p>
          {notice.href ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-8 border-current bg-transparent text-current hover:bg-white/60"
              onClick={() => router.push(notice.href!)}
            >
              {notice.actionLabel ?? "查看详情"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="p-5">
        <div className="mb-4">
          <p className="text-xs font-medium text-muted-foreground">下一步</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">{actionTitle}</h2>
        </div>
        {noticePanel}
        {renderActionForm()}
      </div>
    );
  }

  return (
    <ActionDrawerLayout
      header={
        <ActionDrawerHeader
          detail={detail}
          title={actionTitle}
          description={
            isQuickEntryException
              ? "补齐阻塞处理的字段，保存后系统会自动继续生成采购、库存和后续待办。"
              : actionSpec.description
          }
          onClose={onClose}
        />
      }
      context={
        isShippingAction ? undefined : (
          <>
            <TaskAssignmentCard
              item={taskItem}
              members={assignableMembers}
              onAssigned={onComplete}
            />
            <ContextSummaryCard detail={detail} />
            <PurchaseLinesCard detail={detail} />
          </>
        )
      }
      suggestions={
        isShippingAction ? undefined : <SmartSuggestionPanel suggestions={suggestions} />
      }
      footer={<ActionFooter detailHref={detailHref} />}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold">
          {isQuickEntryException ? "需要补充的信息" : isShippingAction ? "发货核对" : "操作表单"}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isQuickEntryException
            ? "这里只显示本次处理缺少的字段。"
            : isShippingAction
              ? "先确认商品与发货时限，再填写需要交给仓库的信息。"
              : "只填写完成当前动作所需的信息。"}
        </p>
      </div>
      {noticePanel}
      {renderActionForm()}
    </ActionDrawerLayout>
  );
}

function getActionSuggestions(detail: WorkItemDetail) {
  if (detail.primaryAction === "createListing") {
    return [
      detail.actionContext.platform
        ? `已有 Listing 平台：${detail.actionContext.platform}，可继续勾选其他未上架平台。`
        : "从平台库多选要上架的平台；已存在 Listing 的平台会自动跳过。",
      "币种、手续费率和邮费将按平台登记信息自动带出，售价按 SKU 参考价推算。",
    ];
  }
  if (detail.primaryAction === "fillLogistics") {
    return [
      detail.actionContext.currentLocationText
        ? `当前记录位置：${detail.actionContext.currentLocationText}`
        : "目标位置建议填写仓库或转运仓，方便后续到货确认。",
      "这一步只记录购买地物流；同一采购单内的明细会共用这次物流信息。",
    ];
  }
  if (detail.primaryAction === "confirmArrival" || detail.primaryAction === "receivePurchase") {
    if (detail.entityType === "shipment") {
      return [
        "运输段到达后会完成检查并入库，通过后进入可售库存或同步已有上架记录。",
        detail.shipments[0]?.trackingNo
          ? `当前物流单号：${detail.shipments[0].trackingNo}`
          : "确认后会刷新工作台队列。",
      ];
    }
    return [
      "确认到货会在所选位置创建库存；资料完整的商品进入可售，待检查商品进入质检与资料队列。",
      "如果到货位置是转运仓，系统会继续提示分流、集运或转仓。",
      detail.shipments[0]?.trackingNo
        ? `当前物流单号：${detail.shipments[0].trackingNo}`
        : "确认到货后会刷新工作台队列。",
    ];
  }
  if (detail.primaryAction === "inbound") {
    return [
      "当前先支持确认入库；后续可在待分流继续扩展集运、转仓等动作。",
      "新品会按批次入库，中古/单品会按数量生成单件。",
    ];
  }
  if (detail.primaryAction === "disposition") {
    return [
      "「加入待集运」只把商品放入批次，不会立即发货；「立即发起转仓」才会创建物流。",
      "转仓发起后库存进入真实在途；目标仓另行确认到货后，才会生成库存调拨流水。",
    ];
  }
  if (detail.primaryAction === "shipOrder") {
    return [
      "可先「暂存」二维码、取件码等信息，发给代发方；对方发出后再「确认已发货」。",
      detail.actionContext.shippingProofJson ? "当前订单已有暂存的发货凭证。" : null,
      detail.actionContext.trackingNo ? `已有运单号：${detail.actionContext.trackingNo}` : null,
      "未发货前可「取消订单并释放预留」，不会扣减库存。",
      "确认发货后会进入「已发货」，并扣减库存。",
    ].filter(Boolean) as string[];
  }
  if (detail.primaryAction === "confirmDelivery") {
    return [
      "已发货阶段用于在途跟进：查看凭证、登记退货，或确认妥投后进入待结算。",
      "登记退货会自动冲回库存：批次按数量回批次，单品可选「退货待检」或「直接可售」。",
      detail.actionContext.trackingNo
        ? `运单号：${detail.actionContext.trackingNo}`
        : "尚未填写运单号。",
    ].filter(Boolean) as string[];
  }
  if (detail.primaryAction === "approveReturnInspection") {
    return [
      "确认品级、功能状态和必要图片完整后，单件才会恢复可售并允许重新上架。",
      "若仍有问题，请先进入单件档案补充检查结果，不要直接放行。",
    ];
  }
  if (detail.primaryAction === "confirmOrder") {
    return ["确认订单后进入待发货；若无需继续，可直接取消并释放库存预留。"];
  }
  if (detail.primaryAction === "settleOrder") {
    return [
      detail.actionContext.platformFee
        ? `已带出平台手续费：${detail.actionContext.platformFee}`
        : "平台手续费可先按订单默认值填写。",
      detail.actionContext.shippingFee
        ? `已带出邮费：${detail.actionContext.shippingFee}`
        : "实际邮费会影响最终利润。",
      "若买家退货，请使用下方「登记退货」，不要继续结算。",
    ];
  }
  return [];
}

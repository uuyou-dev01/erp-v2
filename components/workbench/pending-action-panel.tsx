"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
import type { WorkbenchPlatformOption } from "./action-drawer-forms";
import {
  ConfirmArrivalForm,
  ConfirmOrderButton,
  CreateListingForm,
  DispositionForm,
  FillLogisticsForm,
  InboundForm,
  OpenDetailLink,
  ResolveExceptionButton,
  SettleOrderForm,
  ShipOrderForm,
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

interface PendingActionPanelProps {
  detail: WorkItemDetail;
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
}

export function PendingActionPanel({
  detail,
  platforms = [],
  locations = [],
  consolidationBatches = [],
  onClose,
  onComplete,
}: PendingActionPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const actionSpec = getWorkflowActionSpec(detail.primaryAction);
  const detailHref =
    detail.detailHref && detail.detailHref !== "/workbench"
      ? detail.detailHref
      : undefined;

  const refresh = () => {
    router.refresh();
    onComplete?.();
  };

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        const result = await fn();
        if (
          detail.primaryAction === "createListing" &&
          result &&
          typeof result === "object" &&
          "ids" in result &&
          Array.isArray((result as { ids: unknown }).ids)
        ) {
          const created = result as {
            ids: string[];
            skuCode?: string;
            listingPageHref?: string;
            skuPageHref?: string;
          };
          if (created.ids.length > 0) {
            const skuHint = created.skuCode ? `（SKU：${created.skuCode}）` : "";
            alert(
              `已创建 ${created.ids.length} 条 Listing${skuHint}。\n\n查看位置：\n· 左侧「设置」→「平台与上架」→「上架列表」\n· 或「商品中心」→ 对应 SKU →「上架情况」`
            );
          }
        }
        refresh();
      } catch (error) {
        alert(error instanceof Error ? error.message : "操作失败");
      }
    });
  };

  const renderActionForm = () => {
    if (detail.primaryAction === "fillLogistics") {
      return <FillLogisticsForm detail={detail} locations={locations} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "confirmArrival" && detail.entityType === "shipment") {
      return <ShipmentArrivalProcessingForm detail={detail} locations={locations} pending={pending} run={run} />;
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
    if (detail.primaryAction === "inbound") return <InboundForm detail={detail} locations={locations} pending={pending} run={run} />;
    if (detail.primaryAction === "createListing") {
      return <CreateListingForm detail={detail} platforms={platforms} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "shipOrder") return <ShipOrderForm detail={detail} pending={pending} run={run} />;
    if (detail.primaryAction === "settleOrder") return <SettleOrderForm detail={detail} pending={pending} run={run} />;
    if (detail.primaryAction === "confirmOrder") return <ConfirmOrderButton detail={detail} pending={pending} run={run} />;
    if (detail.primaryAction === "resolveException" || detail.primaryAction === "retryProcess") {
      return detail.entityType === "quickEntry" ? (
        <ResolveExceptionButton detail={detail} pending={pending} run={run} />
      ) : (
        <OpenDetailLink detail={detail} />
      );
    }
    return <OpenDetailLink detail={detail} />;
  };

  const suggestions = getActionSuggestions(detail);

  return (
    <ActionDrawerLayout
      header={
        <ActionDrawerHeader
          detail={detail}
          title={actionSpec.title}
          description={actionSpec.description}
          onClose={onClose}
        />
      }
      context={
        <>
          <ContextSummaryCard detail={detail} />
          <PurchaseLinesCard detail={detail} />
        </>
      }
      suggestions={<SmartSuggestionPanel suggestions={suggestions} />}
      footer={<ActionFooter detailHref={detailHref} />}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold">操作表单</h3>
        <p className="mt-1 text-xs text-muted-foreground">只填写完成当前动作所需的信息。</p>
      </div>
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
        "运输段到达后会完成检查并入库，通过后进入待创建 Listing 或已有 Listing 的库存同步。",
        detail.shipments[0]?.trackingNo ? `当前物流单号：${detail.shipments[0].trackingNo}` : "确认后会刷新工作台队列。",
      ];
    }
    return [
      "确认到货后会进入待分流，你可以再选择入库、集运、转仓或退货。",
      detail.shipments[0]?.trackingNo ? `当前物流单号：${detail.shipments[0].trackingNo}` : "确认到货后会刷新工作台队列。",
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
      "根据销售地点选择直接入库、加入集运批次、发往其他位置，或退货终止。",
      "加入集运、发出下一段物流或退货后，会从待分流中移除，避免重复处理。",
    ];
  }
  if (detail.primaryAction === "shipOrder") {
    return [
      detail.actionContext.trackingNo ? `已有运单号：${detail.actionContext.trackingNo}` : "可先填写运单号，发货凭证后续补充。",
      "确认发货后会扣减已分配库存。",
    ];
  }
  if (detail.primaryAction === "settleOrder") {
    return [
      detail.actionContext.platformFee ? `已带出平台手续费：${detail.actionContext.platformFee}` : "平台手续费可先按订单默认值填写。",
      detail.actionContext.shippingFee ? `已带出邮费：${detail.actionContext.shippingFee}` : "实际邮费会影响最终利润。",
    ];
  }
  return [];
}

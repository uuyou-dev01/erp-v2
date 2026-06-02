"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { WorkItemDetail } from "@/lib/application/workflow-queries";
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
  ResolveExceptionButton,
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

  const run = (
    fn: () => Promise<unknown>,
    options?: { keepOpen?: boolean; successMessage?: string }
  ) => {
    startTransition(async () => {
      try {
        const result = await fn();
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
              alert(
                `已添加 ${created.ids.length} 条上架记录${skuHint}。\n\n查看位置：库存 → 可售库存\n${href}`
              );
            }
          }
          if (
            (detail.primaryAction === "inbound" ||
              detail.primaryAction === "disposition") &&
            "sellablePageHref" in result &&
            typeof (result as { sellablePageHref: string }).sellablePageHref ===
              "string"
          ) {
            const { sellablePageHref } = result as { sellablePageHref: string };
            const go = confirm(
              "入库已确认，商品已进入可售库存。\n\n是否前往「可售库存」为新入库商品添加上架记录？"
            );
            if (go) {
              router.push(sellablePageHref);
              return;
            }
          }
        }
        if (options?.keepOpen) {
          router.refresh();
          if (options.successMessage) {
            alert(options.successMessage);
          }
          return;
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
    if (detail.primaryAction === "confirmDelivery") {
      return <ShippedOrderForm detail={detail} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "approveReturnInspection") {
      return <ReturnInspectionForm detail={detail} pending={pending} run={run} />;
    }
    if (detail.primaryAction === "settleOrder") return <SettleOrderForm detail={detail} pending={pending} run={run} />;
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
        "运输段到达后会完成检查并入库，通过后进入可售库存或同步已有上架记录。",
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
      detail.actionContext.trackingNo ? `运单号：${detail.actionContext.trackingNo}` : "尚未填写运单号。",
    ].filter(Boolean) as string[];
  }
  if (detail.primaryAction === "approveReturnInspection") {
    return [
      "退货单品处于待检状态，检验通过后可回到可售库存并重新上架。",
      "若检验不通过，可在单件档案中继续备注或调整状态。",
    ];
  }
  if (detail.primaryAction === "confirmOrder") {
    return [
      "确认订单后进入待发货；若无需继续，可直接取消并释放库存预留。",
    ];
  }
  if (detail.primaryAction === "settleOrder") {
    return [
      detail.actionContext.platformFee ? `已带出平台手续费：${detail.actionContext.platformFee}` : "平台手续费可先按订单默认值填写。",
      detail.actionContext.shippingFee ? `已带出邮费：${detail.actionContext.shippingFee}` : "实际邮费会影响最终利润。",
      "若买家退货，请使用下方「登记退货」，不要继续结算。",
    ];
  }
  return [];
}

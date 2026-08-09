import {
  itemConditionReadyForSale,
  itemRequiresIssueEvidence,
  normalizeItemConditionType,
  normalizeUsedItemGrade,
} from "@/lib/inventory/item-condition";

export type ItemUnitPhysicalState =
  | "ON_HAND"
  | "IN_TRANSIT"
  | "OUTBOUND"
  | "RETURNED_TO_SUPPLIER";

export type ItemUnitAvailabilityState =
  | "SELLABLE"
  | "HOLD"
  | "RESERVED"
  | "UNAVAILABLE";

export type ItemUnitQualityState =
  | "UNASSESSED"
  | "PASSED"
  | "FAILED"
  | "NEEDS_EVIDENCE"
  | "NOT_APPLICABLE";

export type ItemUnitWorkflowReason =
  | "NONE"
  | "PURCHASE_GRADING"
  | "FUNCTION_TEST"
  | "EVIDENCE_PHOTOS"
  | "PURCHASE_QC"
  | "CUSTOMER_RETURN_QC"
  | "INSPECTION_FAILED"
  | "INVENTORY_QC";

export interface ItemUnitOperationalStateInput {
  status: string;
  conditionType?: string | null;
  conditionGrade?: string | null;
  functionStatus?: string | null;
  notes?: string | null;
  photoCount?: number;
  sourceType?: string | null;
  locationName?: string | null;
  locationSellable?: boolean;
  latestInspectionResult?: string | null;
  latestInspectionFailureReason?: string | null;
  hasAfterSalesReceipt?: boolean;
}

export interface ItemUnitOperationalState {
  physicalState: ItemUnitPhysicalState;
  physicalLabel: string;
  availabilityState: ItemUnitAvailabilityState;
  availabilityLabel: string;
  qualityState: ItemUnitQualityState;
  qualityLabel: string;
  workflowReason: ItemUnitWorkflowReason;
  statusLabel: string;
  explanation: string;
  nextActionLabel: string | null;
  canReleaseToSale: boolean;
}

function physicalState(input: ItemUnitOperationalStateInput) {
  if (input.status === "RETURN_TO_SUPPLIER") {
    return {
      state: "RETURNED_TO_SUPPLIER" as const,
      label: "已退供应商",
    };
  }
  if (input.status === "CONSOLIDATING") {
    return { state: "IN_TRANSIT" as const, label: "转运中" };
  }
  if (input.status === "CONSUMED") {
    return { state: "OUTBOUND" as const, label: "已出库" };
  }
  return {
    state: "ON_HAND" as const,
    label: input.locationName ? `在${input.locationName}` : "实物在库",
  };
}

function availabilityState(input: ItemUnitOperationalStateInput) {
  if (input.status === "AVAILABLE" && input.locationSellable !== false) {
    return { state: "SELLABLE" as const, label: "可售" };
  }
  if (input.status === "ALLOCATED") {
    return { state: "RESERVED" as const, label: "已预留" };
  }
  if (input.status === "CONSUMED" || input.status === "RETURN_TO_SUPPLIER") {
    return { state: "UNAVAILABLE" as const, label: "不可售" };
  }
  return { state: "HOLD" as const, label: "暂停销售" };
}

function returnCheckState(input: ItemUnitOperationalStateInput) {
  const conditionType = normalizeItemConditionType(input.conditionType);
  const grade = normalizeUsedItemGrade(input.conditionGrade);
  const readyForSale = itemConditionReadyForSale({
    conditionType,
    conditionGrade: input.conditionGrade,
    functionStatus: input.functionStatus,
    notes: input.notes,
    photoCount: input.photoCount,
  });

  if (input.hasAfterSalesReceipt) {
    return {
      qualityState: "UNASSESSED" as const,
      qualityLabel: "售后退货待检",
      workflowReason: "CUSTOMER_RETURN_QC" as const,
      statusLabel: "售后退货待检",
      explanation: "客户退回的实物已经入库，检查通过前不会恢复销售。",
      nextActionLabel: "检验退货商品",
      canReleaseToSale: readyForSale,
    };
  }

  if (input.latestInspectionResult === "FAILED") {
    return {
      qualityState: "FAILED" as const,
      qualityLabel: "检查不通过",
      workflowReason: "INSPECTION_FAILED" as const,
      statusLabel: "检查不通过",
      explanation: input.latestInspectionFailureReason?.trim() || "最近一次检查未通过，需要处理异常。",
      nextActionLabel: "处理检查异常",
      canReleaseToSale: false,
    };
  }

  if (conditionType === "USED" && (!grade || grade === "UNASSESSED")) {
    return {
      qualityState: "UNASSESSED" as const,
      qualityLabel: "待评级",
      workflowReason: "PURCHASE_GRADING" as const,
      statusLabel: input.sourceType === "PURCHASE" ? "采购到货待评级" : "待评级",
      explanation: "中古单件尚未确定 S、A、B、C 或 D 级，暂时不能销售。",
      nextActionLabel: "评定品级",
      canReleaseToSale: false,
    };
  }

  if (conditionType === "USED" && input.functionStatus === "UNTESTED") {
    return {
      qualityState: "UNASSESSED" as const,
      qualityLabel: "待功能检查",
      workflowReason: "FUNCTION_TEST" as const,
      statusLabel: "待功能检查",
      explanation: "中古单件尚未确认功能是否正常，暂时不能销售。",
      nextActionLabel: "完成功能检查",
      canReleaseToSale: false,
    };
  }

  if (itemRequiresIssueEvidence(input) && (input.photoCount ?? 0) < 1) {
    return {
      qualityState: "NEEDS_EVIDENCE" as const,
      qualityLabel: "待补实物图片",
      workflowReason: "EVIDENCE_PHOTOS" as const,
      statusLabel: "待补实物图片",
      explanation: "C/D 级或功能异常的单件需要实物或瑕疵图片后才能销售。",
      nextActionLabel: "补充实物图片",
      canReleaseToSale: false,
    };
  }

  if (input.sourceType === "PURCHASE") {
    return {
      qualityState: "UNASSESSED" as const,
      qualityLabel: "采购到货待复检",
      workflowReason: "PURCHASE_QC" as const,
      statusLabel: "采购到货待复检",
      explanation: "商品已经收货入库，但采购质检尚未完成。",
      nextActionLabel: "完成采购质检",
      canReleaseToSale: readyForSale,
    };
  }

  return {
    qualityState: "UNASSESSED" as const,
    qualityLabel: "库存待复检",
    workflowReason: "INVENTORY_QC" as const,
    statusLabel: "库存待复检",
    explanation: "商品处于暂停销售状态，需要检查后决定是否恢复销售。",
    nextActionLabel: "完成库存检查",
    canReleaseToSale: readyForSale,
  };
}

export function deriveItemUnitOperationalState(
  input: ItemUnitOperationalStateInput
): ItemUnitOperationalState {
  const physical = physicalState(input);
  const availability = availabilityState(input);

  if (input.status === "RETURN_CHECK") {
    return {
      physicalState: physical.state,
      physicalLabel: physical.label,
      availabilityState: availability.state,
      availabilityLabel: availability.label,
      ...returnCheckState(input),
    };
  }

  const statusMap: Record<
    string,
    Pick<
      ItemUnitOperationalState,
      "qualityState" | "qualityLabel" | "statusLabel" | "explanation" | "nextActionLabel"
    >
  > = {
    AVAILABLE: {
      qualityState: "PASSED",
      qualityLabel: "检查完成",
      statusLabel: availability.state === "SELLABLE" ? "可售" : "在库不可售",
      explanation:
        availability.state === "SELLABLE"
          ? "实物在库且当前可以分配和销售。"
          : "商品状态可用，但当前库位不参与销售。",
      nextActionLabel: null,
    },
    ALLOCATED: {
      qualityState: "PASSED",
      qualityLabel: "检查完成",
      statusLabel: "已预留",
      explanation: "商品已经分配给订单，不能重复销售。",
      nextActionLabel: null,
    },
    CONSOLIDATING: {
      qualityState: "NOT_APPLICABLE",
      qualityLabel: "无需检查",
      statusLabel: "转运中",
      explanation: "商品已从原库位移出，正在转运或集运。",
      nextActionLabel: null,
    },
    CONSUMED: {
      qualityState: "NOT_APPLICABLE",
      qualityLabel: "无需检查",
      statusLabel: "已出库",
      explanation: "商品已经完成销售或其他出库处理。",
      nextActionLabel: null,
    },
    RETURN_TO_SUPPLIER: {
      qualityState: "FAILED",
      qualityLabel: "不再入库",
      statusLabel: "已退供应商",
      explanation: "商品已退出本方库存并退回供应商。",
      nextActionLabel: null,
    },
  };
  const status = statusMap[input.status] ?? {
    qualityState: "NOT_APPLICABLE" as const,
    qualityLabel: "状态待确认",
    statusLabel: input.status,
    explanation: "当前状态尚未纳入统一商品状态映射。",
    nextActionLabel: null,
  };

  return {
    physicalState: physical.state,
    physicalLabel: physical.label,
    availabilityState: availability.state,
    availabilityLabel: availability.label,
    qualityState: status.qualityState,
    qualityLabel: status.qualityLabel,
    workflowReason: "NONE",
    statusLabel: status.statusLabel,
    explanation: status.explanation,
    nextActionLabel: status.nextActionLabel,
    canReleaseToSale: false,
  };
}

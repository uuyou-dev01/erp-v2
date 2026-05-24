import type { PrimaryAction, SubProcessType, WorkQueue } from "@/lib/application/next-actions";

export type WorkflowActionFieldType =
  | "text"
  | "textarea"
  | "select"
  | "date"
  | "checkbox"
  | "number";

export interface WorkflowActionField {
  name: string;
  label: string;
  type: WorkflowActionFieldType;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface WorkflowActionSpec {
  action: PrimaryAction;
  title: string;
  description: string;
  submitLabel: string;
  fromQueues: WorkQueue[];
  subProcess: SubProcessType;
  nextQueue?: WorkQueue;
  successMessage: string;
  fields: WorkflowActionField[];
}

export const WORKFLOW_ACTION_SPECS: Record<PrimaryAction, WorkflowActionSpec> = {
  fillLogistics: {
    action: "fillLogistics",
    title: "填写物流",
    description: "补齐购买地发出的物流单号、承运商和位置后，采购单会进入待确认收货。",
    submitLabel: "保存并进入待确认收货",
    fromQueues: ["missingLogistics"],
    subProcess: "LOGISTICS",
    nextQueue: "pendingArrival",
    successMessage: "物流信息已保存",
    fields: [
      { name: "carrier", label: "物流方式 / 承运商", type: "text", placeholder: "顺丰、EMS、DHL..." },
      { name: "etaDate", label: "预计到货日", type: "date" },
      { name: "destinationLocationId", label: "预计到货位置", type: "select", required: true },
      { name: "purchaseTrackingNo", label: "采购物流单号", type: "text" },
      { name: "note", label: "备注", type: "textarea" },
    ],
  },
  confirmArrival: {
    action: "confirmArrival",
    title: "确认到货",
    description: "记录到货位置和时间，商品会进入待分流等待下一步处理。",
    submitLabel: "确认到货",
    fromQueues: ["inTransit", "pendingArrival"],
    subProcess: "LOGISTICS",
    nextQueue: "pendingDisposition",
    successMessage: "到货信息已确认",
    fields: [
      { name: "arrivedAt", label: "到货时间", type: "date" },
      { name: "arrivalLocationId", label: "到货位置", type: "select", required: true },
      { name: "isComplete", label: "是否完整到货", type: "checkbox" },
      { name: "note", label: "备注", type: "textarea" },
    ],
  },
  disposition: {
    action: "disposition",
    title: "分流处理",
    description: "选择入库、加入集运或发往其他位置，决定收货后的下一步。",
    submitLabel: "提交分流",
    fromQueues: ["pendingDisposition"],
    subProcess: "LOGISTICS",
    nextQueue: "inTransit",
    successMessage: "分流动作已提交",
    fields: [],
  },
  inbound: {
    action: "inbound",
    title: "确认入库",
    description: "从待分流中确认入库位置，让商品成为可运营库存。",
    submitLabel: "确认入库",
    fromQueues: ["pendingDisposition"],
    subProcess: "LOGISTICS",
    nextQueue: "inStock",
    successMessage: "入库已确认",
    fields: [
      { name: "locationId", label: "入库位置", type: "select", required: true },
      { name: "note", label: "备注", type: "textarea" },
    ],
  },
  createListing: {
    action: "createListing",
    title: "创建 Listing",
    description: "仅用于从未创建平台 Listing 的 SKU，或需要单件上架的中古商品。",
    submitLabel: "创建 Listing",
    fromQueues: ["pendingListing"],
    subProcess: "LISTING",
    nextQueue: "listed",
    successMessage: "上架记录已创建",
    fields: [
      { name: "platformIds", label: "平台（多选）", type: "text", required: true, placeholder: "从平台库选择" },
    ],
  },
  shipOrder: {
    action: "shipOrder",
    title: "确认发货",
    description: "记录发货方式和运单号，扣减已分配库存。",
    submitLabel: "确认已发货",
    fromQueues: ["pendingShipment"],
    subProcess: "FULFILLMENT",
    nextQueue: "shipped",
    successMessage: "订单已标记发货",
    fields: [
      { name: "shipper", label: "发货人", type: "text" },
      { name: "shippingMethod", label: "发货方式", type: "text" },
      { name: "trackingNo", label: "运单号", type: "text" },
      { name: "proofNote", label: "发货凭证备注", type: "textarea" },
    ],
  },
  settleOrder: {
    action: "settleOrder",
    title: "填写结算",
    description: "录入真实手续费、邮费和到账信息，完成利润确认。",
    submitLabel: "完成结算",
    fromQueues: ["pendingSettlement"],
    subProcess: "SETTLEMENT",
    nextQueue: "completed",
    successMessage: "结算已完成",
    fields: [
      { name: "actualSalePrice", label: "实际售价", type: "number" },
      { name: "platformFee", label: "实际手续费", type: "number" },
      { name: "shippingFee", label: "实际邮费", type: "number" },
      { name: "actualReceived", label: "实际到账", type: "number" },
      { name: "fxRate", label: "汇率", type: "number" },
    ],
  },
  resolveException: {
    action: "resolveException",
    title: "处理异常",
    description: "重新处理或进入完整详情排查阻塞原因。",
    submitLabel: "重新处理",
    fromQueues: ["exception", "inspectionException"],
    subProcess: "INSPECTION",
    successMessage: "异常已重新处理",
    fields: [{ name: "note", label: "处理备注", type: "textarea" }],
  },
  confirmOrder: {
    action: "confirmOrder",
    title: "确认订单",
    description: "确认库存分配后进入待发货。",
    submitLabel: "确认订单",
    fromQueues: ["pendingShipment"],
    subProcess: "FULFILLMENT",
    nextQueue: "pendingShipment",
    successMessage: "订单已确认",
    fields: [],
  },
  receivePurchase: {
    action: "receivePurchase",
    title: "确认收货",
    description: "采购单到货后进入待分流，不在这一步直接创建库存。",
    submitLabel: "确认收货",
    fromQueues: ["pendingArrival"],
    subProcess: "LOGISTICS",
    nextQueue: "pendingDisposition",
    successMessage: "采购到货已确认",
    fields: [
      { name: "arrivalLocationId", label: "到货位置", type: "select", required: true },
      { name: "arrivedAt", label: "到货时间", type: "date" },
    ],
  },
  retryProcess: {
    action: "retryProcess",
    title: "重新处理",
    description: "重新运行结构化处理。",
    submitLabel: "重新处理",
    fromQueues: ["exception"],
    subProcess: "INSPECTION",
    successMessage: "已重新处理",
    fields: [],
  },
  viewDetails: {
    action: "viewDetails",
    title: "查看详情",
    description: "当前事项已进入后续流程，可打开详情页查看状态。",
    submitLabel: "查看详情",
    fromQueues: ["inTransit", "inStock", "listed", "completed"],
    subProcess: "LOGISTICS",
    successMessage: "详情已打开",
    fields: [],
  },
};

export function getWorkflowActionSpec(action: PrimaryAction) {
  return WORKFLOW_ACTION_SPECS[action];
}

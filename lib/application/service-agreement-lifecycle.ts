export const SERVICE_AGREEMENT_STATUS = {
  PENDING_COUNTERPARTY: "PENDING_COUNTERPARTY",
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  ENDED: "ENDED",
} as const;

export type ServiceAgreementStatus =
  (typeof SERVICE_AGREEMENT_STATUS)[keyof typeof SERVICE_AGREEMENT_STATUS];

export const SERVICE_AGREEMENT_TYPES = [
  "RECEIVING",
  "INSPECTION",
  "STORAGE",
  "FULFILLMENT",
  "RETURN",
] as const;

export function normalizeServiceAgreementTypes(values: string[]) {
  const allowed = new Set<string>(SERVICE_AGREEMENT_TYPES);
  const normalized = Array.from(new Set(values.map((value) => value.trim().toUpperCase())))
    .filter((value) => allowed.has(value));
  if (!normalized.length) throw new Error("请至少选择一种有效服务");
  return normalized;
}

export function agreementCounterpartOrganizationId(input: {
  clientOrganizationId: string;
  providerOrganizationId: string;
  currentOrganizationId: string;
}) {
  if (input.currentOrganizationId === input.clientOrganizationId) {
    return input.providerOrganizationId;
  }
  if (input.currentOrganizationId === input.providerOrganizationId) {
    return input.clientOrganizationId;
  }
  throw new Error("当前企业不是协议参与方");
}

export function canEndServiceAgreement(status: string) {
  return status === SERVICE_AGREEMENT_STATUS.PENDING_COUNTERPARTY ||
    status === SERVICE_AGREEMENT_STATUS.ACTIVE ||
    status === SERVICE_AGREEMENT_STATUS.PAUSED;
}

export function canReviseServiceAgreement(status: string) {
  return status === SERVICE_AGREEMENT_STATUS.ACTIVE ||
    status === SERVICE_AGREEMENT_STATUS.PAUSED;
}

export function assertCanConfirmServiceAgreement(input: {
  status: string;
  currentOrganizationId: string;
  proposedByOrganizationId?: string | null;
  pausedByOrganizationId?: string | null;
}) {
  if (input.status === SERVICE_AGREEMENT_STATUS.PENDING_COUNTERPARTY) {
    if (!input.proposedByOrganizationId) throw new Error("旧版协议草稿需要重新创建");
    if (input.proposedByOrganizationId === input.currentOrganizationId) {
      throw new Error("协议必须由对方企业管理员确认");
    }
    return;
  }
  if (input.status === SERVICE_AGREEMENT_STATUS.PAUSED) {
    if (!input.pausedByOrganizationId) throw new Error("旧版暂停协议需要创建修订版");
    if (input.pausedByOrganizationId === input.currentOrganizationId) {
      throw new Error("暂停后的恢复必须由对方企业管理员确认");
    }
    return;
  }
  throw new Error("当前协议状态不能确认或恢复");
}

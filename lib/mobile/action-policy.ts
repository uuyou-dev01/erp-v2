import type { PrimaryAction } from "@/lib/application/next-actions";

export type MobileRiskLevel = "LOW" | "MEDIUM" | "HIGH";
export type MobileCompletionPolicy = "DOMAIN_ACTION_REQUIRED" | "TASK_ONLY";

export interface MobileActionPolicy {
  enabled: boolean;
  riskLevel: MobileRiskLevel;
  completionPolicy: MobileCompletionPolicy;
  requiresOnline: boolean;
  requiresSecondConfirm?: boolean;
  requiredEvidence?: Array<"PHOTO" | "BARCODE">;
}

const DISABLED: MobileActionPolicy = {
  enabled: false,
  riskLevel: "HIGH",
  completionPolicy: "DOMAIN_ACTION_REQUIRED",
  requiresOnline: true,
};

export const MOBILE_ACTION_POLICIES: Record<PrimaryAction, MobileActionPolicy> = {
  fillLogistics: {
    enabled: true,
    riskLevel: "LOW",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
  },
  confirmArrival: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
  },
  receivePurchase: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
  },
  disposition: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
  },
  inbound: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
  },
  shipOrder: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
    requiredEvidence: ["PHOTO"],
  },
  confirmDelivery: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
  },
  confirmOrder: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
  },
  approveReturnInspection: {
    enabled: true,
    riskLevel: "MEDIUM",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
  },
  createListing: DISABLED,
  registerReturn: {
    enabled: true,
    riskLevel: "HIGH",
    completionPolicy: "DOMAIN_ACTION_REQUIRED",
    requiresOnline: true,
    requiresSecondConfirm: true,
    requiredEvidence: ["PHOTO"],
  },
  cancelOrder: DISABLED,
  settleOrder: DISABLED,
  resolveException: DISABLED,
  retryProcess: DISABLED,
  viewDetails: DISABLED,
};

export function getMobileActionPolicy(action: PrimaryAction) {
  return MOBILE_ACTION_POLICIES[action];
}

/**
 * Canonical identity and collaboration vocabulary.
 *
 * Keep these concepts separate: a User is a person, Membership is an internal
 * organization role, LocationFulfiller is an external warehouse relationship,
 * and OrganizationConnection only confirms two business identities.
 */
export const RELATIONSHIP_KIND = {
  ORGANIZATION_MEMBERSHIP: "ORGANIZATION_MEMBERSHIP",
  WAREHOUSE_COLLABORATION: "WAREHOUSE_COLLABORATION",
  ORGANIZATION_CONNECTION: "ORGANIZATION_CONNECTION",
} as const;

export const WAREHOUSE_FULFILLER_ROLE = {
  MANAGER: "MANAGER",
  OPERATOR: "OPERATOR",
  // Read-compatible legacy role. New invitations use MANAGER or OPERATOR.
  BACKUP: "BACKUP",
} as const;

export type WarehouseFulfillerRole =
  (typeof WAREHOUSE_FULFILLER_ROLE)[keyof typeof WAREHOUSE_FULFILLER_ROLE];

export const INVITABLE_WAREHOUSE_FULFILLER_ROLES = [
  WAREHOUSE_FULFILLER_ROLE.MANAGER,
  WAREHOUSE_FULFILLER_ROLE.OPERATOR,
] as const;

export const WAREHOUSE_FULFILLER_STATUS = {
  INVITED: "INVITED",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  ENDED: "ENDED",
} as const;

export type WarehouseFulfillerStatus =
  (typeof WAREHOUSE_FULFILLER_STATUS)[keyof typeof WAREHOUSE_FULFILLER_STATUS];

export const WAREHOUSE_RELATIONSHIP_EVENT = {
  INVITED: "INVITED",
  REOPENED: "REOPENED",
  ACCEPTED: "ACCEPTED",
  ROLE_CHANGED: "ROLE_CHANGED",
  SUSPENDED: "SUSPENDED",
  REACTIVATED: "REACTIVATED",
  ENDED: "ENDED",
} as const;

export const COLLABORATION_CAPABILITY = {
  WAREHOUSE_SHIP: "warehouse.ship",
  WAREHOUSE_DISPATCH: "warehouse.dispatch",
} as const;

export type CollaborationCapability =
  (typeof COLLABORATION_CAPABILITY)[keyof typeof COLLABORATION_CAPABILITY];

export const WAREHOUSE_ROLE_LABELS: Record<WarehouseFulfillerRole, string> = {
  MANAGER: "任务负责人",
  OPERATOR: "任务协作者",
  BACKUP: "任务协作者（旧角色）",
};

export const WAREHOUSE_STATUS_LABELS: Record<WarehouseFulfillerStatus, string> = {
  INVITED: "待接受",
  ACTIVE: "合作中",
  SUSPENDED: "已暂停",
  ENDED: "已结束",
};

export function normalizeWarehouseFulfillerRole(value?: string | null): WarehouseFulfillerRole {
  const role = value?.trim().toUpperCase() || WAREHOUSE_FULFILLER_ROLE.OPERATOR;
  if (role === WAREHOUSE_FULFILLER_ROLE.BACKUP) return WAREHOUSE_FULFILLER_ROLE.BACKUP;
  if ((INVITABLE_WAREHOUSE_FULFILLER_ROLES as readonly string[]).includes(role)) {
    return role as WarehouseFulfillerRole;
  }
  throw new Error("请选择有效的任务角色");
}

export function capabilitiesForWarehouseRole(role: string | null | undefined) {
  if (role === WAREHOUSE_FULFILLER_ROLE.MANAGER) {
    return [
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
      COLLABORATION_CAPABILITY.WAREHOUSE_DISPATCH,
    ] as const;
  }
  if (role === WAREHOUSE_FULFILLER_ROLE.OPERATOR || role === WAREHOUSE_FULFILLER_ROLE.BACKUP) {
    return [COLLABORATION_CAPABILITY.WAREHOUSE_SHIP] as const;
  }
  return [] as const;
}

export function hasWarehouseCapability(
  role: string | null | undefined,
  capability: CollaborationCapability
) {
  return (capabilitiesForWarehouseRole(role) as readonly string[]).includes(capability);
}

export function resolveAuthenticatedDestination(input: {
  requestedNext?: string | null;
  hasMembership: boolean;
  hasWarehouseRelationship: boolean;
}) {
  const requestedNext = input.requestedNext;
  if (
    requestedNext?.startsWith("/invite/team/") ||
    requestedNext?.startsWith("/invite/warehouse/") ||
    requestedNext?.startsWith("/collaboration")
  ) {
    return requestedNext;
  }
  if (input.hasMembership) return requestedNext ?? "/workbench";
  if (input.hasWarehouseRelationship) return "/collaboration";
  return "/onboarding";
}

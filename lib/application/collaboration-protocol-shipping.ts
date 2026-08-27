import type { Prisma } from "@prisma/client";
import { COLLABORATION_CAPABILITY } from "@/lib/application/collaboration-capabilities";
import {
  createCollaborationRequest,
  createTaskDispatch,
  type CollaborationProtocolClient,
} from "@/lib/application/collaboration-protocol";

export const WAREHOUSE_SHIPPING_PROTOCOL = "warehouse.shipping";

export async function createShipOrderDispatch(
  client: CollaborationProtocolClient,
  input: {
    organizationId: string;
    createdByUserId: string;
    locationId: string;
    orderId: string;
    idempotencyKey: string;
    targetUserId?: string | null;
    taskId?: string | null;
    expiresAt?: Date | null;
    metadata?: Prisma.InputJsonObject;
  }
) {
  const target = input.targetUserId
    ? ({ type: "USER", ref: input.targetUserId } as const)
    : ({ type: "LOCATION", ref: input.locationId } as const);
  const request = await createCollaborationRequest(client, {
    organizationId: input.organizationId,
    protocol: WAREHOUSE_SHIPPING_PROTOCOL,
    protocolVersion: 1,
    kind: "SHIP_ORDER",
    acceptancePolicy: input.targetUserId ? "DIRECT_ACCEPT" : "FIRST_ACCEPT",
    requester: { type: "USER", ref: input.createdByUserId },
    target,
    idempotencyKey: input.idempotencyKey,
    payload: { orderId: input.orderId, locationId: input.locationId },
    expiresAt: input.expiresAt,
    createdById: input.createdByUserId,
  });
  const dispatch = await createTaskDispatch(client, {
    requestId: request.id,
    taskId: input.taskId,
    target,
    requiredCapability: COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
    capabilityLocationId: input.locationId,
    idempotencyKey: input.idempotencyKey,
    metadata: {
      orderId: input.orderId,
      locationId: input.locationId,
      ...(input.metadata ?? {}),
    },
    actor: { type: "USER", ref: input.createdByUserId },
  });
  return { request, dispatch };
}

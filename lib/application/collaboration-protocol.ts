import { Prisma } from "@prisma/client";
import {
  isUserEligibleForCollaborationScope,
  resolveCollaborationCapabilities,
} from "@/lib/application/collaboration-capabilities";

export const COLLABORATION_REQUEST_STATUS = {
  OPEN: "OPEN",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  WITHDRAWN: "WITHDRAWN",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
  CLOSED: "CLOSED",
} as const;

export const TASK_DISPATCH_STATUS = {
  QUEUED: "QUEUED",
  CLAIMED: "CLAIMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;

export type CollaborationScopeType = "ORGANIZATION" | "LOCATION" | "ROLE" | "USER";
export type CollaborationAcceptancePolicy =
  | "FIRST_ACCEPT"
  | "DIRECT_ACCEPT"
  | "AUTHORIZED_APPROVAL";
export type CollaborationResponseDecision = "ACCEPT" | "REJECT" | "APPROVE" | "DENY";

export type CollaborationProtocolClient = Pick<
  Prisma.TransactionClient,
  | "collaborationRequest"
  | "collaborationResponse"
  | "collaborationEvent"
  | "taskDispatch"
  | "locationFulfiller"
  | "membership"
>;

export type CollaborationScope = { type: CollaborationScopeType; ref: string };

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function jsonInput(value: unknown) {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

async function appendCollaborationEvent(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    responseId?: string | null;
    dispatchId?: string | null;
    type:
      | "REQUESTED"
      | "RESPONSE_RECORDED"
      | "ACCEPTED"
      | "REJECTED"
      | "WITHDRAWN"
      | "CANCELLED"
      | "EXPIRED"
      | "CLOSED"
      | "TASK_DISPATCHED"
      | "TASK_ACCEPTED"
      | "TASK_REJECTED"
      | "TASK_COMPLETED";
    actor?: CollaborationScope | null;
    dedupeKey: string;
    payload?: unknown;
  }
) {
  return client.collaborationEvent.upsert({
    where: {
      requestId_dedupeKey: {
        requestId: input.requestId,
        dedupeKey: requiredText(input.dedupeKey, "事件幂等键"),
      },
    },
    update: {},
    create: {
      requestId: input.requestId,
      responseId: input.responseId,
      dispatchId: input.dispatchId,
      type: input.type,
      actorScopeType: input.actor?.type,
      actorScopeRef: input.actor?.ref,
      dedupeKey: input.dedupeKey.trim(),
      payload: jsonInput(input.payload),
    },
  });
}

export async function createCollaborationRequest(
  client: CollaborationProtocolClient,
  input: {
    organizationId: string;
    protocol: string;
    protocolVersion?: number;
    kind: string;
    acceptancePolicy: CollaborationAcceptancePolicy;
    requester: CollaborationScope;
    target: CollaborationScope;
    parentRequestId?: string | null;
    idempotencyKey: string;
    payload?: unknown;
    expiresAt?: Date | null;
    createdById: string;
  }
) {
  const idempotencyKey = requiredText(input.idempotencyKey, "请求幂等键");
  const protocol = requiredText(input.protocol, "协议代码");
  const kind = requiredText(input.kind, "请求类型");
  const requesterRef = requiredText(input.requester.ref, "请求方范围");
  const targetRef = requiredText(input.target.ref, "目标范围");

  if (input.parentRequestId) {
    const parent = await client.collaborationRequest.findFirst({
      where: { id: input.parentRequestId, organizationId: input.organizationId },
      select: { id: true },
    });
    if (!parent) throw new Error("父协作请求不存在或不属于当前组织");
  }

  const request = await client.collaborationRequest.upsert({
    where: {
      organizationId_idempotencyKey: {
        organizationId: input.organizationId,
        idempotencyKey,
      },
    },
    update: {},
    create: {
      organizationId: input.organizationId,
      protocol,
      protocolVersion: input.protocolVersion ?? 1,
      kind,
      acceptancePolicy: input.acceptancePolicy,
      requesterScopeType: input.requester.type,
      requesterScopeRef: requesterRef,
      targetScopeType: input.target.type,
      targetScopeRef: targetRef,
      parentRequestId: input.parentRequestId,
      idempotencyKey,
      payload: jsonInput(input.payload),
      expiresAt: input.expiresAt,
      createdById: input.createdById,
    },
  });

  if (
    request.protocol !== protocol ||
    request.protocolVersion !== (input.protocolVersion ?? 1) ||
    request.kind !== kind ||
    request.acceptancePolicy !== input.acceptancePolicy ||
    request.requesterScopeType !== input.requester.type ||
    request.requesterScopeRef !== requesterRef ||
    request.targetScopeType !== input.target.type ||
    request.targetScopeRef !== targetRef ||
    request.parentRequestId !== (input.parentRequestId ?? null)
  ) {
    throw new Error("请求幂等键已用于不同的协作请求");
  }

  await appendCollaborationEvent(client, {
    requestId: request.id,
    type: "REQUESTED",
    actor: input.requester,
    dedupeKey: "request:created",
  });
  return request;
}

export function resolveCollaborationResponseTransition(input: {
  acceptancePolicy: CollaborationAcceptancePolicy;
  decision: CollaborationResponseDecision;
  responderIsTargetScope: boolean;
}): "ACCEPTED" | "REJECTED" | null {
  if (input.acceptancePolicy === "FIRST_ACCEPT") {
    if (input.decision === "ACCEPT") return "ACCEPTED";
    if (input.decision === "REJECT" && input.responderIsTargetScope) return "REJECTED";
    if (input.decision !== "REJECT") {
      throw new Error("FIRST_ACCEPT 只接受 ACCEPT 或 REJECT 响应");
    }
    return null;
  }
  if (input.acceptancePolicy === "DIRECT_ACCEPT") {
    if (input.decision === "ACCEPT") return "ACCEPTED";
    if (input.decision === "REJECT") return "REJECTED";
    throw new Error("DIRECT_ACCEPT 只接受 ACCEPT 或 REJECT 响应");
  }
  if (input.decision === "APPROVE") return "ACCEPTED";
  if (input.decision === "DENY") return "REJECTED";
  throw new Error("AUTHORIZED_APPROVAL 只接受 APPROVE 或 DENY 响应");
}

export async function respondToCollaborationRequest(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    responder: CollaborationScope;
    decision: CollaborationResponseDecision;
    idempotencyKey: string;
    payload?: unknown;
    respondedAt?: Date;
  }
) {
  const idempotencyKey = requiredText(input.idempotencyKey, "响应幂等键");
  const responderRef = requiredText(input.responder.ref, "响应方范围");
  const request = await client.collaborationRequest.findUnique({
    where: { id: input.requestId },
  });
  if (!request) throw new Error("协作请求不存在");

  const repeated = await client.collaborationResponse.findUnique({
    where: { requestId_idempotencyKey: { requestId: request.id, idempotencyKey } },
  });
  if (repeated) {
    if (repeated.decision !== input.decision) throw new Error("响应幂等键已用于不同决定");
    return { request, response: repeated, transitioned: false };
  }
  if (request.status !== COLLABORATION_REQUEST_STATUS.OPEN) {
    throw new Error("协作请求已经结束，不能新增响应");
  }

  const responderIsTargetScope =
    request.targetScopeType === input.responder.type && request.targetScopeRef === responderRef;
  if (!responderIsTargetScope) {
    if (input.responder.type !== "USER") throw new Error("响应方不在协作请求目标范围内");
    const eligible = await isUserEligibleForCollaborationScope(client, {
      userId: responderRef,
      organizationId: request.organizationId,
      scopeType: request.targetScopeType,
      scopeRef: request.targetScopeRef,
    });
    if (!eligible) throw new Error("响应方不在协作请求目标范围内");
  }

  const response = await client.collaborationResponse.upsert({
    where: {
      requestId_idempotencyKey: {
        requestId: request.id,
        idempotencyKey,
      },
    },
    update: {},
    create: {
      requestId: request.id,
      responderScopeType: input.responder.type,
      responderScopeRef: responderRef,
      decision: input.decision,
      idempotencyKey,
      payload: jsonInput(input.payload),
      respondedAt: input.respondedAt,
    },
  });
  if (response.decision !== input.decision) throw new Error("响应幂等键已用于不同决定");

  await appendCollaborationEvent(client, {
    requestId: request.id,
    responseId: response.id,
    type: "RESPONSE_RECORDED",
    actor: input.responder,
    dedupeKey: `response:${response.id}:recorded`,
    payload: { decision: response.decision },
  });

  const nextStatus = resolveCollaborationResponseTransition({
    acceptancePolicy: request.acceptancePolicy,
    decision: input.decision,
    responderIsTargetScope,
  });
  if (!nextStatus) return { request, response, transitioned: false };

  const resolvedAt = input.respondedAt ?? new Date();
  const transition = await client.collaborationRequest.updateMany({
    where: { id: request.id, status: COLLABORATION_REQUEST_STATUS.OPEN },
    data: {
      status: nextStatus,
      resolvedAt,
      resolutionCode: `RESPONSE_${input.decision}`,
    },
  });
  if (transition.count === 0) {
    return {
      request: await client.collaborationRequest.findUniqueOrThrow({ where: { id: request.id } }),
      response,
      transitioned: false,
    };
  }

  await appendCollaborationEvent(client, {
    requestId: request.id,
    responseId: response.id,
    type: nextStatus === "ACCEPTED" ? "ACCEPTED" : "REJECTED",
    actor: input.responder,
    dedupeKey: `request:${nextStatus.toLowerCase()}:${response.id}`,
  });

  if (nextStatus === "REJECTED") {
    const queued = await client.taskDispatch.findMany({
      where: { requestId: request.id, status: TASK_DISPATCH_STATUS.QUEUED },
      select: { id: true },
    });
    await client.taskDispatch.updateMany({
      where: { requestId: request.id, status: TASK_DISPATCH_STATUS.QUEUED },
      data: { status: TASK_DISPATCH_STATUS.CANCELLED, cancelledAt: resolvedAt },
    });
    await Promise.all(
      queued.map((dispatch) =>
        appendCollaborationEvent(client, {
          requestId: request.id,
          responseId: response.id,
          dispatchId: dispatch.id,
          type: "TASK_REJECTED",
          actor: input.responder,
          dedupeKey: `dispatch:${dispatch.id}:rejected:${response.id}`,
        })
      )
    );
  }

  return {
    request: await client.collaborationRequest.findUniqueOrThrow({ where: { id: request.id } }),
    response,
    transitioned: true,
  };
}

export async function createTaskDispatch(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    taskId?: string | null;
    target: CollaborationScope;
    requiredCapability?: string | null;
    capabilityLocationId?: string | null;
    idempotencyKey: string;
    metadata?: unknown;
    actor?: CollaborationScope | null;
  }
) {
  const idempotencyKey = requiredText(input.idempotencyKey, "派发幂等键");
  const targetRef = requiredText(input.target.ref, "派发目标范围");
  const request = await client.collaborationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error("协作请求不存在");
  if (
    request.status === "REJECTED" ||
    request.status === "WITHDRAWN" ||
    request.status === "CANCELLED" ||
    request.status === "EXPIRED" ||
    request.status === "CLOSED"
  ) {
    throw new Error("已结束的协作请求不能创建任务派发");
  }

  const dispatch = await client.taskDispatch.upsert({
    where: { requestId_idempotencyKey: { requestId: request.id, idempotencyKey } },
    update: {},
    create: {
      requestId: request.id,
      taskId: input.taskId,
      targetScopeType: input.target.type,
      targetScopeRef: targetRef,
      requiredCapability: input.requiredCapability,
      capabilityLocationId: input.capabilityLocationId,
      idempotencyKey,
      metadata: jsonInput(input.metadata),
    },
  });
  if (
    dispatch.taskId !== (input.taskId ?? null) ||
    dispatch.targetScopeType !== input.target.type ||
    dispatch.targetScopeRef !== targetRef ||
    dispatch.requiredCapability !== (input.requiredCapability ?? null) ||
    dispatch.capabilityLocationId !== (input.capabilityLocationId ?? null)
  ) {
    throw new Error("派发幂等键已用于不同任务或目标");
  }

  await appendCollaborationEvent(client, {
    requestId: request.id,
    dispatchId: dispatch.id,
    type: "TASK_DISPATCHED",
    actor: input.actor,
    dedupeKey: `dispatch:${dispatch.id}:created`,
  });
  return dispatch;
}

export async function claimTaskDispatch(
  client: CollaborationProtocolClient,
  input: { dispatchId: string; userId: string; claimedAt?: Date }
) {
  const dispatch = await client.taskDispatch.findUnique({
    where: { id: input.dispatchId },
    include: { request: true },
  });
  if (!dispatch) throw new Error("任务派发不存在");
  const isWinnerRetry =
    dispatch.status === TASK_DISPATCH_STATUS.CLAIMED && dispatch.claimedByUserId === input.userId;
  if (!isWinnerRetry && dispatch.status !== TASK_DISPATCH_STATUS.QUEUED) {
    throw new Error("任务派发已经被领取或结束");
  }
  if (
    ["REJECTED", "WITHDRAWN", "CANCELLED", "EXPIRED", "CLOSED"].includes(dispatch.request.status)
  ) {
    throw new Error("协作请求已经结束，不能领取任务");
  }
  if (
    dispatch.request.acceptancePolicy === "AUTHORIZED_APPROVAL" &&
    dispatch.request.status !== "ACCEPTED"
  ) {
    throw new Error("任务尚未通过授权审批");
  }

  if (!isWinnerRetry) {
    const eligible = await isUserEligibleForCollaborationScope(client, {
      userId: input.userId,
      organizationId: dispatch.request.organizationId,
      scopeType: dispatch.targetScopeType,
      scopeRef: dispatch.targetScopeRef,
    });
    if (!eligible) throw new Error("当前用户不在任务派发目标范围内");

    if (dispatch.requiredCapability) {
      const capabilities = await resolveCollaborationCapabilities(client, {
        userId: input.userId,
        organizationId: dispatch.request.organizationId,
        locationId:
          dispatch.capabilityLocationId ??
          (dispatch.targetScopeType === "LOCATION" ? dispatch.targetScopeRef : null),
      });
      if (!capabilities.has(dispatch.requiredCapability)) {
        throw new Error(`缺少领取任务所需能力：${dispatch.requiredCapability}`);
      }
    }
  }

  const claimedAt = dispatch.claimedAt ?? input.claimedAt ?? new Date();
  if (!isWinnerRetry) {
    const claimed = await client.taskDispatch.updateMany({
      where: { id: dispatch.id, status: TASK_DISPATCH_STATUS.QUEUED },
      data: {
        status: TASK_DISPATCH_STATUS.CLAIMED,
        claimedByUserId: input.userId,
        claimedAt,
      },
    });
    if (claimed.count === 0) {
      const current = await client.taskDispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
      if (current.status !== "CLAIMED" || current.claimedByUserId !== input.userId) {
        throw new Error("任务已经被其他协作者领取");
      }
    }
  }

  if (dispatch.request.acceptancePolicy === "FIRST_ACCEPT") {
    await client.taskDispatch.updateMany({
      where: {
        requestId: dispatch.requestId,
        id: { not: dispatch.id },
        status: TASK_DISPATCH_STATUS.QUEUED,
      },
      data: { status: TASK_DISPATCH_STATUS.CANCELLED, cancelledAt: claimedAt },
    });
  }
  const actor = { type: "USER" as const, ref: input.userId };
  const responseIdempotencyKey = `dispatch:${dispatch.id}:claim:${input.userId}`;
  const previousAcceptance = await client.collaborationResponse.findFirst({
    where: {
      requestId: dispatch.requestId,
      responderScopeType: "USER",
      responderScopeRef: input.userId,
      decision: "ACCEPT",
    },
    orderBy: { respondedAt: "asc" },
  });
  const response =
    previousAcceptance ??
    (await client.collaborationResponse.upsert({
      where: {
        requestId_idempotencyKey: {
          requestId: dispatch.requestId,
          idempotencyKey: responseIdempotencyKey,
        },
      },
      update: {},
      create: {
        requestId: dispatch.requestId,
        responderScopeType: "USER",
        responderScopeRef: input.userId,
        decision: "ACCEPT",
        idempotencyKey: responseIdempotencyKey,
        respondedAt: claimedAt,
        payload: { dispatchId: dispatch.id },
      },
    }));
  await appendCollaborationEvent(client, {
    requestId: dispatch.requestId,
    responseId: response.id,
    dispatchId: dispatch.id,
    type: "RESPONSE_RECORDED",
    actor,
    dedupeKey: `response:${response.id}:recorded`,
    payload: { decision: "ACCEPT", dispatchId: dispatch.id },
  });
  const accepted = await client.collaborationRequest.updateMany({
    where: { id: dispatch.requestId, status: COLLABORATION_REQUEST_STATUS.OPEN },
    data: {
      status: COLLABORATION_REQUEST_STATUS.ACCEPTED,
      resolvedAt: claimedAt,
      resolutionCode: "TASK_CLAIMED",
    },
  });
  if (accepted.count > 0) {
    await appendCollaborationEvent(client, {
      requestId: dispatch.requestId,
      responseId: response.id,
      dispatchId: dispatch.id,
      type: "ACCEPTED",
      actor,
      dedupeKey: `request:accepted:dispatch:${dispatch.id}`,
    });
  }
  await appendCollaborationEvent(client, {
    requestId: dispatch.requestId,
    responseId: response.id,
    dispatchId: dispatch.id,
    type: "TASK_ACCEPTED",
    actor,
    dedupeKey: `dispatch:${dispatch.id}:claimed`,
  });
  return client.taskDispatch.findUniqueOrThrow({ where: { id: dispatch.id } });
}

export async function completeTaskDispatch(
  client: CollaborationProtocolClient,
  input: { dispatchId: string; userId: string; completedAt?: Date; payload?: unknown }
) {
  const completedAt = input.completedAt ?? new Date();
  const completed = await client.taskDispatch.updateMany({
    where: {
      id: input.dispatchId,
      status: TASK_DISPATCH_STATUS.CLAIMED,
      claimedByUserId: input.userId,
    },
    data: { status: TASK_DISPATCH_STATUS.COMPLETED, completedAt },
  });
  const dispatch = await client.taskDispatch.findUnique({ where: { id: input.dispatchId } });
  if (!dispatch) throw new Error("任务派发不存在");
  if (completed.count === 0) {
    if (
      dispatch.status !== TASK_DISPATCH_STATUS.COMPLETED ||
      dispatch.claimedByUserId !== input.userId
    ) {
      throw new Error("只有任务领取人可以完成派发");
    }
  }
  await appendCollaborationEvent(client, {
    requestId: dispatch.requestId,
    dispatchId: dispatch.id,
    type: "TASK_COMPLETED",
    actor: { type: "USER", ref: input.userId },
    dedupeKey: `dispatch:${dispatch.id}:completed`,
    payload: input.payload,
  });
  await closeCollaborationRequest(client, {
    requestId: dispatch.requestId,
    actor: { type: "USER", ref: input.userId },
    resolutionCode: "DISPATCH_COMPLETED",
    closedAt: completedAt,
  });
  return dispatch;
}

export async function withdrawCollaborationRequest(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    actor: CollaborationScope;
    resolutionCode?: string;
    withdrawnAt?: Date;
  }
) {
  const withdrawnAt = input.withdrawnAt ?? new Date();
  const transitioned = await client.collaborationRequest.updateMany({
    where: { id: input.requestId, status: COLLABORATION_REQUEST_STATUS.OPEN },
    data: {
      status: COLLABORATION_REQUEST_STATUS.WITHDRAWN,
      resolvedAt: withdrawnAt,
      resolutionCode: input.resolutionCode ?? "WITHDRAWN_BY_REQUESTER",
    },
  });
  const request = await client.collaborationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error("协作请求不存在");
  if (transitioned.count === 0 && request.status !== COLLABORATION_REQUEST_STATUS.WITHDRAWN) {
    throw new Error("只有尚未接受的协作请求可以撤回");
  }
  await client.taskDispatch.updateMany({
    where: { requestId: request.id, status: TASK_DISPATCH_STATUS.QUEUED },
    data: { status: TASK_DISPATCH_STATUS.CANCELLED, cancelledAt: withdrawnAt },
  });
  await appendCollaborationEvent(client, {
    requestId: request.id,
    type: "WITHDRAWN",
    actor: input.actor,
    dedupeKey: "request:withdrawn",
    payload: { resolutionCode: input.resolutionCode ?? "WITHDRAWN_BY_REQUESTER" },
  });
  return client.collaborationRequest.findUniqueOrThrow({ where: { id: request.id } });
}

export async function cancelAcceptedCollaborationRequest(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    actor: CollaborationScope;
    resolutionCode: string;
    cancelledAt?: Date;
  }
) {
  const cancelledAt = input.cancelledAt ?? new Date();
  const transitioned = await client.collaborationRequest.updateMany({
    where: { id: input.requestId, status: COLLABORATION_REQUEST_STATUS.ACCEPTED },
    data: {
      status: COLLABORATION_REQUEST_STATUS.CANCELLED,
      resolvedAt: cancelledAt,
      cancelledAt,
      resolutionCode: requiredText(input.resolutionCode, "取消原因代码"),
    },
  });
  const request = await client.collaborationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error("协作请求不存在");
  if (transitioned.count === 0 && request.status !== COLLABORATION_REQUEST_STATUS.CANCELLED) {
    throw new Error("只有已经接受且尚未结束的协作请求可以管理取消");
  }
  await client.taskDispatch.updateMany({
    where: {
      requestId: request.id,
      status: { in: [TASK_DISPATCH_STATUS.QUEUED, TASK_DISPATCH_STATUS.CLAIMED] },
    },
    data: { status: TASK_DISPATCH_STATUS.CANCELLED, cancelledAt },
  });
  await appendCollaborationEvent(client, {
    requestId: request.id,
    type: "CANCELLED",
    actor: input.actor,
    dedupeKey: "request:cancelled",
    payload: { resolutionCode: input.resolutionCode },
  });
  return client.collaborationRequest.findUniqueOrThrow({ where: { id: request.id } });
}

export async function closeCollaborationRequest(
  client: CollaborationProtocolClient,
  input: {
    requestId: string;
    actor: CollaborationScope;
    resolutionCode?: string;
    closedAt?: Date;
  }
) {
  const closedAt = input.closedAt ?? new Date();
  const transitioned = await client.collaborationRequest.updateMany({
    where: { id: input.requestId, status: COLLABORATION_REQUEST_STATUS.ACCEPTED },
    data: {
      status: COLLABORATION_REQUEST_STATUS.CLOSED,
      resolvedAt: closedAt,
      resolutionCode: input.resolutionCode ?? "COMPLETED",
    },
  });
  const request = await client.collaborationRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new Error("协作请求不存在");
  if (transitioned.count === 0 && request.status !== COLLABORATION_REQUEST_STATUS.CLOSED) {
    throw new Error("只有已经接受的协作请求可以关闭");
  }
  await appendCollaborationEvent(client, {
    requestId: request.id,
    type: "CLOSED",
    actor: input.actor,
    dedupeKey: "request:closed",
    payload: { resolutionCode: input.resolutionCode ?? "COMPLETED" },
  });
  return client.collaborationRequest.findUniqueOrThrow({ where: { id: request.id } });
}

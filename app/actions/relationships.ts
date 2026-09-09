"use server";

import { revalidatePath } from "next/cache";
import { requestOrganizationConnectionAction } from "@/app/actions/organization-connections";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { INCOMPLETE_TASK_STATUSES } from "@/lib/application/tasks";
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export async function getMyRelationshipSummary() {
  const user = await requireAuthenticatedUser();
  const [memberships, relationships] = await Promise.all([
    prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: {
        role: true,
        organization: { select: { id: true, name: true, collaborationCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.locationFulfiller.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        organizationId: true,
        role: true,
        status: true,
        isDefault: true,
        acceptedAt: true,
        suspendedAt: true,
        updatedAt: true,
        organization: { select: { id: true, name: true, collaborationCode: true } },
        location: { select: { id: true, name: true, code: true, region: true } },
        events: {
          select: {
            id: true,
            eventType: true,
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    }),
  ]);

  const activeRelationships = relationships.filter(
    (relationship) => relationship.status === "ACTIVE"
  );
  const openCounts = activeRelationships.length
    ? await prisma.task.groupBy({
        by: ["organizationId", "fulfillmentLocationId"],
        where: {
          type: "SHIP_ORDER",
          status: { in: [...INCOMPLETE_TASK_STATUSES] },
          OR: activeRelationships.map((relationship) => ({
            organizationId: relationship.organizationId,
            fulfillmentLocationId: relationship.location.id,
          })),
        },
        _count: { _all: true },
      })
    : [];
  const countByScope = new Map(
    openCounts.map((row) => [`${row.organizationId}:${row.fulfillmentLocationId}`, row._count._all])
  );

  const organizationIds = memberships.map((membership) => membership.organization.id);
  const targetOrganizationIds = Array.from(
    new Set(relationships.map((relationship) => relationship.organizationId))
  );
  const connections = organizationIds.length
    ? await prisma.organizationConnection.findMany({
        where: {
          OR: [
            {
              requesterOrganizationId: { in: organizationIds },
              targetOrganizationId: { in: targetOrganizationIds },
            },
            {
              requesterOrganizationId: { in: targetOrganizationIds },
              targetOrganizationId: { in: organizationIds },
            },
          ],
        },
        select: {
          id: true,
          requesterOrganizationId: true,
          targetOrganizationId: true,
          status: true,
        },
      })
    : [];

  return {
    user,
    memberships,
    relationships: relationships.map((relationship) => ({
      ...relationship,
      pendingTaskCount:
        countByScope.get(`${relationship.organizationId}:${relationship.location.id}`) ?? 0,
      connections: connections.filter(
        (connection) =>
          [connection.requesterOrganizationId, connection.targetOrganizationId].includes(
            relationship.organizationId
          ) &&
          organizationIds.some((organizationId) =>
            [connection.requesterOrganizationId, connection.targetOrganizationId].includes(
              organizationId
            )
          )
      ),
    })),
  };
}

export async function requestOrganizationConnectionFromWarehouseAction(fulfillerId: string) {
  try {
    const [user, context] = await Promise.all([requireAuthenticatedUser(), requireUserContext()]);
    const relationship = await prisma.locationFulfiller.findFirst({
      where: { id: fulfillerId, userId: user.id, status: "ACTIVE" },
      select: {
        organizationId: true,
        organization: { select: { collaborationCode: true, name: true } },
      },
    });
    if (!relationship) throw new Error("只有仍在合作中的仓库关系可以直接发起企业连接");
    if (relationship.organizationId === context.organizationId) {
      throw new Error("不能连接当前企业自己");
    }
    const result = await requestOrganizationConnectionAction({
      collaborationCode: relationship.organization.collaborationCode,
    });
    if (!result.success) throw new Error(result.error);
    revalidatePath("/collaboration");
    return actionSuccess({
      connectionId: result.connectionId,
      targetName: relationship.organization.name,
    });
  } catch (error) {
    return toActionFailure(error, "发起企业合作失败，请重试");
  }
}

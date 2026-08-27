import { parseShippingProof } from "@/lib/application/shipping-proof";
import { prisma } from "@/lib/prisma";

const COLLABORATION_TASK_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "OVERDUE", "DONE"];

export async function getCollaborationShippingTasksForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!user) throw new Error("当前用户不存在");

  const activeRoster = await prisma.locationFulfiller.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { organizationId: true, locationId: true, role: true },
  });
  const locationIds = Array.from(new Set(activeRoster.map((entry) => entry.locationId)));
  const declinedRequestIds = new Set(
    (
      await prisma.collaborationResponse.findMany({
        where: {
          responderScopeType: "USER",
          responderScopeRef: user.id,
          decision: "REJECT",
        },
        select: { requestId: true },
      })
    ).map((response) => response.requestId)
  );
  const openHandoffs = await prisma.collaborationRequest.findMany({
    where: {
      kind: "SHIP_ORDER_HANDOFF",
      status: "OPEN",
      targetScopeType: "USER",
      targetScopeRef: user.id,
      parentRequestId: { not: null },
    },
    select: { id: true, parentRequestId: true, payload: true },
  });
  const handoffByParentId = new Map(
    openHandoffs.flatMap((request) =>
      request.parentRequestId ? [[request.parentRequestId, request] as const] : []
    )
  );

  const tasks = await prisma.task.findMany({
    where: {
      type: "SHIP_ORDER",
      refType: "CUSTOMER_ORDER",
      status: { in: COLLABORATION_TASK_STATUSES },
      fulfillmentLocationId: { not: null },
      OR: [
        { assignedToId: user.id },
        { completedById: user.id },
        {
          dispatch: {
            is: {
              OR: [
                {
                  status: "QUEUED",
                  targetScopeType: "LOCATION",
                  targetScopeRef: { in: locationIds },
                },
                { status: "QUEUED", targetScopeType: "USER", targetScopeRef: user.id },
                { status: { in: ["CLAIMED", "COMPLETED"] }, claimedByUserId: user.id },
                { requestId: { in: Array.from(handoffByParentId.keys()) } },
              ],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      status: true,
      title: true,
      description: true,
      dueAt: true,
      createdAt: true,
      completedAt: true,
      organizationId: true,
      createdById: true,
      assignedToId: true,
      completedById: true,
      fulfillmentLocationId: true,
      refId: true,
      dispatch: {
        select: {
          id: true,
          requestId: true,
          status: true,
          targetScopeType: true,
          targetScopeRef: true,
          claimedByUserId: true,
        },
      },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
  });

  const taskLocationIds = Array.from(
    new Set(tasks.map((task) => task.fulfillmentLocationId).filter(Boolean) as string[])
  );
  const organizationIds = Array.from(new Set(tasks.map((task) => task.organizationId)));
  const creatorIds = Array.from(new Set(tasks.map((task) => task.createdById)));
  const assigneeIds = Array.from(
    new Set(tasks.map((task) => task.assignedToId).filter(Boolean) as string[])
  );
  const [locations, organizations, creators, assignees] = await Promise.all([
    prisma.location.findMany({
      where: { id: { in: taskLocationIds } },
      select: { id: true, name: true, code: true, region: true },
    }),
    prisma.organization.findMany({
      where: { id: { in: organizationIds } },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const activeRosterKeys = new Set(
    activeRoster.map((row) => `${row.organizationId}:${row.locationId}`)
  );
  const locationById = new Map(locations.map((location) => [location.id, location]));
  const organizationById = new Map(
    organizations.map((organization) => [organization.id, organization])
  );
  const creatorById = new Map(creators.map((creator) => [creator.id, creator]));
  const assigneeById = new Map(assignees.map((assignee) => [assignee.id, assignee]));

  const orderIds = tasks.map((task) => task.refId);
  const orders = orderIds.length
    ? await prisma.customerOrder.findMany({
        where: { id: { in: orderIds }, orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] } },
        select: {
          id: true,
          orderNumber: true,
          lines: {
            select: {
              id: true,
              quantity: true,
              sku: { select: { code: true, name: true, imageUrl: true, variantLabel: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  // Recipient details and previously entered shipment evidence are only fetched
  // after the assignee explicitly accepts the task.
  const acceptedOrderIds = tasks
    .filter(
      (task) =>
        task.status === "DONE" ||
        (task.status === "IN_PROGRESS" && task.assignedToId === user.id)
    )
    .map((task) => task.refId);
  const acceptedOrderDetails = acceptedOrderIds.length
    ? await prisma.customerOrder.findMany({
        where: {
          id: { in: acceptedOrderIds },
          orderStatus: { in: ["CONFIRMED", "SHIPPED", "DELIVERED"] },
        },
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          shippingAddress: true,
          shippingCountry: true,
          trackingNo: true,
          shippingProof: true,
        },
      })
    : [];
  const acceptedDetailsByOrderId = new Map(acceptedOrderDetails.map((order) => [order.id, order]));

  return tasks.flatMap((task) => {
    const order = orderById.get(task.refId);
    const dispatch = task.dispatch;
    const handoff = dispatch ? handoffByParentId.get(dispatch.requestId) : null;
    const isQueuedForWarehouse = Boolean(
      dispatch &&
        dispatch.status === "QUEUED" &&
        !declinedRequestIds.has(dispatch.requestId) &&
        ((dispatch.targetScopeType === "LOCATION" &&
          activeRosterKeys.has(`${task.organizationId}:${dispatch.targetScopeRef}`)) ||
          (dispatch.targetScopeType === "USER" && dispatch.targetScopeRef === user.id))
    );
    const isClaimedByMe = Boolean(
      dispatch &&
        ["CLAIMED", "COMPLETED"].includes(dispatch.status) &&
        dispatch.claimedByUserId === user.id
    );
    const isLegacyAssignedToMe = task.assignedToId === user.id;
    const isCompletedByMe = task.completedById === user.id;
    if (
      !order ||
      !task.fulfillmentLocationId ||
      (!isQueuedForWarehouse &&
        !isClaimedByMe &&
        !isLegacyAssignedToMe &&
        !isCompletedByMe &&
        !handoff)
    ) {
      return [];
    }
    const location = locationById.get(task.fulfillmentLocationId);
    if (!location) return [];
    const creator = creatorById.get(task.createdById);
    const assignee = task.assignedToId ? assigneeById.get(task.assignedToId) : null;
    const acceptedDetails = acceptedDetailsByOrderId.get(task.refId);
    const visibleStatus = isQueuedForWarehouse || handoff ? "ASSIGNED" : task.status;
    return [
      {
        id: task.id,
        status: visibleStatus,
        title: task.title,
        description: task.description,
        dueAt: task.dueAt?.toISOString() ?? null,
        createdAt: task.createdAt.toISOString(),
        completedAt: task.completedAt?.toISOString() ?? null,
        organizationId: task.organizationId,
        fulfillmentLocationId: task.fulfillmentLocationId,
        organizationName: organizationById.get(task.organizationId)?.name || "委托企业",
        assignedByName: creator?.name || creator?.email || null,
        assigneeName: assignee?.name || assignee?.email || null,
        handoffRequestId: handoff?.id ?? null,
        isHandoffOffer: Boolean(handoff),
        location,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          recipientVisible: Boolean(acceptedDetails),
          customerName: acceptedDetails?.customerName ?? null,
          customerPhone: acceptedDetails?.customerPhone ?? null,
          shippingAddress: acceptedDetails?.shippingAddress ?? null,
          shippingCountry: acceptedDetails?.shippingCountry ?? null,
          trackingNo: acceptedDetails?.trackingNo ?? null,
          shippingProof: parseShippingProof(acceptedDetails?.shippingProof),
          lines: order.lines.map((line) => ({
            id: line.id,
            quantity: line.quantity.toString(),
            sku: line.sku,
          })),
        },
      },
    ];
  });
}

export type CollaborationShippingTask = Awaited<
  ReturnType<typeof getCollaborationShippingTasksForUser>
>[number];

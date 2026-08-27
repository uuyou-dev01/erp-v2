import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  acceptShipOrderHandoff,
  claimShipOrderTask,
  declineShipOrderTask,
  ensureShipOrderTaskDispatch,
  requestShipOrderHandoff,
  returnShipOrderTask,
  withdrawShipOrderTask,
} from "@/lib/application/shipping-dispatch-lifecycle";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { markOrderShippedAsLocationFulfiller } from "@/app/actions/customer-orders";

const runId = `shipping_dispatch_${Date.now()}`;
let organizationId = "";
let storeId = "";
let locationId = "";
let ownerId = "";
let firstUserId = "";
let secondUserId = "";
let taskId = "";

describe("warehouse shipment dispatch lifecycle", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `${runId}_org`, name: "Dispatch Test Organization" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: {
        organizationId,
        code: `${runId}_store`,
        name: "Dispatch Test Store",
        currency: "CNY",
      },
    });
    storeId = store.id;
    const [owner, first, second] = await Promise.all([
      prisma.user.create({
        data: { email: `${runId}_owner@example.com`, password: "test", role: "OWNER", storeId },
      }),
      prisma.user.create({
        data: { email: `${runId}_first@example.com`, password: "test", role: "USER" },
      }),
      prisma.user.create({
        data: { email: `${runId}_second@example.com`, password: "test", role: "USER" },
      }),
    ]);
    ownerId = owner.id;
    firstUserId = first.id;
    secondUserId = second.id;
    await prisma.membership.create({
      data: { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({ data: { storeId, userId: ownerId, role: "OWNER" } });
    const location = await prisma.location.create({
      data: {
        storeId,
        code: `${runId}_wh`,
        name: "Dispatch Warehouse",
        type: "WAREHOUSE",
      },
    });
    locationId = location.id;
    await prisma.locationFulfiller.createMany({
      data: [first, second].map((user) => ({
        organizationId,
        locationId,
        userId: user.id,
        email: user.email,
        role: "OPERATOR",
        status: "ACTIVE",
        acceptedAt: new Date(),
        invitedById: ownerId,
      })),
    });
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.notificationOutbox.deleteMany({
      where: { notification: { organizationId } },
    });
    await prisma.notification.deleteMany({ where: { organizationId } });
    await prisma.task.deleteMany({ where: { organizationId } });
    await prisma.locationFulfiller.deleteMany({ where: { organizationId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, firstUserId, secondUserId] } },
    });
  });

  it("queues, claims atomically, returns, hands off with acceptance, and audits withdrawal", async () => {
    const bundle = await ensureShipOrderTaskDispatch({
      organizationId,
      storeId,
      orderId: `${runId}_order`,
      orderNumber: `${runId}_ORDER`,
      createdById: ownerId,
      locationId,
    });
    taskId = bundle.task.id;

    expect(bundle.task.status).toBe("OPEN");
    expect(bundle.dispatch.status).toBe("QUEUED");
    await expect(
      prisma.notification.count({ where: { taskId, type: "WAREHOUSE_TASK_AVAILABLE" } })
    ).resolves.toBe(2);

    // A personal decline only removes the task from that person's queue. The same
    // person may later accept it again while the warehouse request is still open.
    // This protects the response history index from regressing back to a unique
    // responder constraint (the production failure reported in the claim drawer).
    await declineShipOrderTask({ taskId, userId: firstUserId });
    await claimShipOrderTask({ taskId, userId: firstUserId });
    const firstDispatch = await prisma.taskDispatch.findUniqueOrThrow({ where: { taskId } });
    await expect(
      prisma.collaborationResponse.findMany({
        where: {
          requestId: firstDispatch.requestId,
          responderScopeType: "USER",
          responderScopeRef: firstUserId,
        },
        select: { decision: true },
        orderBy: { respondedAt: "asc" },
      })
    ).resolves.toEqual([{ decision: "REJECT" }, { decision: "ACCEPT" }]);

    await returnShipOrderTask({ taskId, userId: firstUserId });
    await claimShipOrderTask({ taskId, userId: firstUserId });
    await expect(
      prisma.collaborationResponse.count({
        where: {
          requestId: firstDispatch.requestId,
          responderScopeType: "USER",
          responderScopeRef: firstUserId,
          decision: "ACCEPT",
        },
      })
    ).resolves.toBe(1);
    await returnShipOrderTask({ taskId, userId: firstUserId });

    const attempts = await Promise.allSettled([
      claimShipOrderTask({ taskId, userId: firstUserId }),
      claimShipOrderTask({ taskId, userId: secondUserId }),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);

    const claimed = await prisma.taskDispatch.findUniqueOrThrow({ where: { taskId } });
    const firstWinner = claimed.claimedByUserId!;
    const otherUser = firstWinner === firstUserId ? secondUserId : firstUserId;
    await expect(
      prisma.collaborationResponse.count({
        where: {
          requestId: claimed.requestId,
          responderScopeType: "USER",
          responderScopeRef: firstWinner,
          decision: "ACCEPT",
        },
      })
    ).resolves.toBe(1);

    await returnShipOrderTask({ taskId, userId: firstWinner });
    await expect(prisma.taskDispatch.findUniqueOrThrow({ where: { taskId } })).resolves.toMatchObject({
      status: "QUEUED",
      claimedByUserId: null,
    });

    await claimShipOrderTask({ taskId, userId: otherUser });
    const handoff = await requestShipOrderHandoff({
      taskId,
      actorUserId: otherUser,
      targetUserId: firstWinner,
    });
    expect(handoff.outcome).toBe("transfer_pending");
    await expect(prisma.task.findUniqueOrThrow({ where: { id: taskId } })).resolves.toMatchObject({
      assignedToId: otherUser,
      status: "IN_PROGRESS",
    });

    await acceptShipOrderHandoff({
      requestId: handoff.requestId,
      taskId,
      userId: firstWinner,
    });
    await expect(prisma.task.findUniqueOrThrow({ where: { id: taskId } })).resolves.toMatchObject({
      assignedToId: firstWinner,
      status: "IN_PROGRESS",
    });

    await expect(
      withdrawShipOrderTask({ taskId, actorUserId: ownerId })
    ).rejects.toThrow("请填写撤回原因");
    await withdrawShipOrderTask({
      taskId,
      actorUserId: ownerId,
      reason: "订单已由客户取消",
    });
    const [task, request, dispatch] = await Promise.all([
      prisma.task.findUniqueOrThrow({ where: { id: taskId } }),
      prisma.collaborationRequest.findUniqueOrThrow({ where: { id: claimed.requestId } }),
      prisma.taskDispatch.findUniqueOrThrow({ where: { taskId } }),
    ]);
    expect(task.status).toBe("CANCELLED");
    expect(request.status).toBe("CANCELLED");
    expect(dispatch.status).toBe("CANCELLED");
  });

  it("completes an externally claimed shipment exactly once across inventory and collaboration", async () => {
    const sku = await prisma.sKU.create({
      data: {
        storeId,
        code: `${runId}_completion_sku`,
        name: "Dispatch Completion Product",
      },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "TEST",
        sourceId: `${runId}_completion_source`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId,
        entityType: "LOT",
        entityId: lot.id,
        locationId,
        deltaQty: "1",
        reason: "INBOUND_PURCHASE",
      },
    });
    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `${runId}_completion_order`,
        customerName: "Dispatch Completion Buyer",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "100",
        totalPaid: "100",
        orderStatus: "CONFIRMED",
        confirmedAt: new Date(),
        lines: {
          create: {
            skuId: sku.id,
            quantity: "1",
            unitPrice: "100",
            lineAmount: "100",
            supplyStatus: "READY_TO_SHIP",
          },
        },
      },
      include: { lines: true },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: order.lines[0].id,
        allocationType: "LOT",
        lotId: lot.id,
        quantity: "1",
        unitCost: "80",
        costAmount: "80",
        costCurrency: "CNY",
        costSourceType: "TEST",
        costSourceId: `${runId}_completion_source`,
        status: "ALLOCATED",
      },
    });

    const bundle = await ensureShipOrderTaskDispatch({
      organizationId,
      storeId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      createdById: ownerId,
      locationId,
    });
    await claimShipOrderTask({ taskId: bundle.task.id, userId: firstUserId });

    process.env.ERP_DEV_USER_EMAIL = `${runId}_first@example.com`;
    await markOrderShippedAsLocationFulfiller(bundle.task.id, {
      trackingNo: `${runId}_tracking`,
    });

    const [shippedOrder, completedTask, completedDispatch, workCount, outboundCount] =
      await Promise.all([
        prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } }),
        prisma.task.findUniqueOrThrow({ where: { id: bundle.task.id } }),
        prisma.taskDispatch.findUniqueOrThrow({
          where: { id: bundle.dispatch.id },
          include: { request: true },
        }),
        prisma.workRecord.count({
          where: { taskId: bundle.task.id, workCode: "SHIP_ORDER" },
        }),
        prisma.stockLedger.count({
          where: {
            entityType: "LOT",
            entityId: lot.id,
            reason: "OUTBOUND_SALE",
            refId: order.lines[0].id,
          },
        }),
      ]);
    expect(shippedOrder).toMatchObject({
      orderStatus: "SHIPPED",
      trackingNo: `${runId}_tracking`,
    });
    expect(completedTask.status).toBe("DONE");
    expect(completedDispatch.status).toBe("COMPLETED");
    expect(completedDispatch.request.status).toBe("CLOSED");
    expect(workCount).toBe(1);
    expect(outboundCount).toBe(1);

    await expect(
      markOrderShippedAsLocationFulfiller(bundle.task.id, {
        trackingNo: `${runId}_duplicate_tracking`,
      })
    ).rejects.toThrow("任务不存在或未指派给你");
    await expect(
      prisma.stockLedger.count({
        where: { entityType: "LOT", entityId: lot.id, reason: "OUTBOUND_SALE" },
      })
    ).resolves.toBe(1);
    await expect(
      prisma.workRecord.count({ where: { taskId: bundle.task.id, workCode: "SHIP_ORDER" } })
    ).resolves.toBe(1);
  });
});

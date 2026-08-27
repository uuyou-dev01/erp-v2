import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  ensureWarehouseRosterLocationAccess,
  revokeWarehouseRosterLocationAccess,
} from "@/lib/application/location-fulfillment-access";
import { getCollaborationShippingTasksForUser } from "@/lib/application/collaboration-shipping-tasks";
import { getCollaborationTaskSummaryForUser } from "@/lib/application/collaboration-task-summary";
import { hasLocationCapability } from "@/lib/auth/scope-access";
import { createInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  acceptLocationFulfillerInvitationAction,
  getLocationFulfillerInvitationByToken,
  getLocationFulfillerRoster,
} from "@/app/actions/location-fulfillers";
import { assignWorkTaskAction } from "@/app/actions/tasks";

const runId = `warehouse_collaboration_${Date.now()}`;
const ownerEmail = `${runId}_owner@example.com`;
const collaboratorEmail = `${runId}_collaborator@example.com`;
const manualAccessEmail = `${runId}_manual@example.com`;
const secretCustomerName = `Private Recipient ${runId}`;
const secretPhone = `138${Date.now().toString().slice(-8)}`;
const secretAddress = `Private Address ${runId}`;

let organizationId = "";
let storeId = "";
let ownerId = "";
let collaboratorId = "";
let manualAccessUserId = "";
let locationId = "";
let orderId = "";
let taskId = "";

describe("warehouse-scoped fulfillment collaboration", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `${runId}_ORG`, name: "Warehouse Collaboration Test" },
    });
    organizationId = organization.id;

    const store = await prisma.store.create({
      data: {
        organizationId,
        code: `${runId}_STORE`,
        name: "Warehouse Collaboration Store",
        currency: "CNY",
      },
    });
    storeId = store.id;

    const [owner, collaborator, manualAccessUser] = await Promise.all([
      prisma.user.create({
        data: { email: ownerEmail, password: "test", role: "OWNER", storeId },
      }),
      prisma.user.create({
        data: { email: collaboratorEmail, password: "test", role: "USER", storeId: null },
      }),
      prisma.user.create({
        data: { email: manualAccessEmail, password: "test", role: "USER", storeId: null },
      }),
    ]);
    ownerId = owner.id;
    collaboratorId = collaborator.id;
    manualAccessUserId = manualAccessUser.id;

    await prisma.membership.create({
      data: { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({ data: { storeId, userId: ownerId, role: "OWNER" } });

    const location = await prisma.location.create({
      data: {
        storeId,
        code: `${runId}_WH`,
        name: "Friend Warehouse",
        type: "WAREHOUSE",
        // Keep this null to verify that a roster read remains read-only.
        operatorOrganizationId: null,
      },
    });
    locationId = location.id;

    await prisma.locationFulfiller.createMany({
      data: [
        {
          organizationId,
          locationId,
          userId: collaboratorId,
          email: collaboratorEmail,
          status: "ACTIVE",
          invitedById: ownerId,
          acceptedAt: new Date(),
        },
        {
          organizationId,
          locationId,
          userId: manualAccessUserId,
          email: manualAccessEmail,
          status: "ACTIVE",
          invitedById: ownerId,
          acceptedAt: new Date(),
        },
      ],
    });

    const sku = await prisma.sKU.create({
      data: { storeId, code: `${runId}_SKU`, name: "Visible Product" },
    });
    const inventoryLot = await prisma.inventoryLot.create({
      data: {
        storeId,
        skuId: sku.id,
        locationId,
        unitCost: "80",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `${runId}_SOURCE`,
        receivedAt: new Date(),
      },
    });
    const order = await prisma.customerOrder.create({
      data: {
        storeId,
        orderNumber: `${runId}_ORDER`,
        customerName: secretCustomerName,
        customerPhone: secretPhone,
        shippingAddress: secretAddress,
        shippingCountry: "CN",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "100",
        totalPaid: "100",
        orderStatus: "CONFIRMED",
        lines: {
          create: {
            skuId: sku.id,
            quantity: "1",
            unitPrice: "100",
            lineAmount: "100",
          },
        },
      },
    });
    orderId = order.id;
    const orderLine = await prisma.orderLine.findFirstOrThrow({
      where: { orderId },
      select: { id: true },
    });
    await prisma.orderAllocation.create({
      data: {
        orderLineId: orderLine.id,
        allocationType: "LOT",
        lotId: inventoryLot.id,
        quantity: "1",
        unitCost: "80",
        costAmount: "80",
        status: "ALLOCATED",
      },
    });
    const task = await prisma.task.create({
      data: {
        organizationId,
        storeId,
        type: "SHIP_ORDER",
        status: "ASSIGNED",
        title: "Ship private order",
        refType: "CUSTOMER_ORDER",
        refId: orderId,
        createdById: ownerId,
        assignedToId: collaboratorId,
        delegatedToId: collaboratorId,
        assignedAt: new Date(),
        fulfillmentLocationId: locationId,
      },
    });
    taskId = task.id;

    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.task.deleteMany({ where: { id: taskId } });
    await prisma.locationAccess.deleteMany({
      where: { locationId, userId: { in: [collaboratorId, manualAccessUserId] } },
    });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, collaboratorId, manualAccessUserId] } },
    });
  });

  it("grants an external collaborator shipping only", async () => {
    await prisma.$transaction((tx) =>
      ensureWarehouseRosterLocationAccess(tx, { locationId, userId: collaboratorId })
    );

    const access = await prisma.locationAccess.findUniqueOrThrow({
      where: { locationId_userId: { locationId, userId: collaboratorId } },
    });
    expect(access.role).toBe("VIEWER");
    expect(access.permissions).toMatchObject({
      ship: true,
      viewRecipient: true,
      source: "WAREHOUSE_ROSTER",
    });
    await expect(hasLocationCapability(collaboratorId, locationId, "ship")).resolves.toBe(true);
    await expect(hasLocationCapability(collaboratorId, locationId, "receive")).resolves.toBe(false);
    await expect(hasLocationCapability(collaboratorId, locationId, "inspect")).resolves.toBe(false);
  });

  it("preserves access owned by another authorization source", async () => {
    const originalPermissions = { receive: true, ship: true, source: "SERVICE_AGREEMENT" };
    await prisma.locationAccess.create({
      data: {
        locationId,
        userId: manualAccessUserId,
        role: "OPERATOR",
        permissions: originalPermissions,
      },
    });

    await prisma.$transaction((tx) =>
      ensureWarehouseRosterLocationAccess(tx, { locationId, userId: manualAccessUserId })
    );
    await prisma.$transaction((tx) =>
      revokeWarehouseRosterLocationAccess(tx, { locationId, userId: manualAccessUserId })
    );

    const preserved = await prisma.locationAccess.findUniqueOrThrow({
      where: { locationId_userId: { locationId, userId: manualAccessUserId } },
    });
    expect(preserved.role).toBe("OPERATOR");
    expect(preserved.permissions).toEqual(originalPermissions);
  });

  it("revokes only the access row owned by the warehouse roster", async () => {
    await prisma.$transaction((tx) =>
      revokeWarehouseRosterLocationAccess(tx, { locationId, userId: collaboratorId })
    );
    await expect(
      prisma.locationAccess.findUnique({
        where: { locationId_userId: { locationId, userId: collaboratorId } },
      })
    ).resolves.toBeNull();
  });

  it("persists the allocated warehouse when assigning a collaborator", async () => {
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "OPEN",
        assignedToId: null,
        delegatedToId: null,
        assignedAt: null,
        fulfillmentLocationId: null,
      },
    });

    const result = await assignWorkTaskAction(taskId, collaboratorId);
    expect(result.success).toBe(true);
    await expect(
      prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { assignedToId: true, fulfillmentLocationId: true },
      })
    ).resolves.toEqual({
      assignedToId: collaboratorId,
      fulfillmentLocationId: locationId,
    });
    await expect(getCollaborationTaskSummaryForUser(collaboratorId)).resolves.toEqual({
      hasWarehouseCollaboration: true,
      pendingTaskCount: 1,
    });
  });

  it("does not expose recipient details until the collaborator accepts", async () => {
    const assignedTasks = await getCollaborationShippingTasksForUser(collaboratorId);
    const assigned = assignedTasks.find((task) => task.id === taskId);
    expect(assigned?.order.recipientVisible).toBe(false);
    expect(assigned?.order.customerName).toBeNull();
    expect(assigned?.order.customerPhone).toBeNull();
    expect(assigned?.order.shippingAddress).toBeNull();
    expect(JSON.stringify(assigned)).not.toContain(secretCustomerName);
    expect(JSON.stringify(assigned)).not.toContain(secretPhone);
    expect(JSON.stringify(assigned)).not.toContain(secretAddress);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
    });
    const acceptedTasks = await getCollaborationShippingTasksForUser(collaboratorId);
    const accepted = acceptedTasks.find((task) => task.id === taskId);
    expect(accepted?.order).toMatchObject({
      recipientVisible: true,
      customerName: secretCustomerName,
      customerPhone: secretPhone,
      shippingAddress: secretAddress,
    });
  });

  it("keeps completed work visible after warehouse access is suspended", async () => {
    await Promise.all([
      prisma.task.update({
        where: { id: taskId },
        data: { status: "DONE", completedAt: new Date(), completedById: collaboratorId },
      }),
      prisma.customerOrder.update({
        where: { id: orderId },
        data: { orderStatus: "SHIPPED", shippedAt: new Date() },
      }),
      prisma.locationFulfiller.updateMany({
        where: { locationId, userId: collaboratorId },
        data: { status: "SUSPENDED", suspendedAt: new Date() },
      }),
    ]);

    const history = await getCollaborationShippingTasksForUser(collaboratorId);
    expect(history.find((task) => task.id === taskId)).toMatchObject({
      status: "DONE",
      completedAt: expect.any(String),
      organizationName: "Warehouse Collaboration Test",
      location: { id: locationId },
      order: { orderNumber: `${runId}_ORDER`, recipientVisible: true },
    });
  });

  it("does not claim a warehouse operator while reading the roster", async () => {
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
    // Legacy dual-write triggers normally populate this field on creation. Clear it
    // explicitly so this assertion isolates the roster read itself.
    await prisma.location.update({
      where: { id: locationId },
      data: { operatorOrganizationId: null },
    });
    await getLocationFulfillerRoster(locationId);
    const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
    expect(location.operatorOrganizationId).toBeNull();
  });

  it("reuses one account when a second warehouse invitation is accepted repeatedly", async () => {
    const secondLocation = await prisma.location.create({
      data: {
        storeId,
        code: `${runId}_WH_B`,
        name: "Friend Warehouse B",
        type: "WAREHOUSE",
      },
    });
    const token = createInvitationToken();
    await prisma.locationFulfiller.create({
      data: {
        organizationId,
        locationId: secondLocation.id,
        email: collaboratorEmail,
        status: "INVITED",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        invitedById: ownerId,
      },
    });

    process.env.ERP_DEV_USER_EMAIL = collaboratorEmail;
    try {
      const accepted = await acceptLocationFulfillerInvitationAction(token);
      expect(accepted).toMatchObject({
        success: true,
        destination: "/collaboration/tasks",
        alreadyAccepted: false,
      });
      const repeated = await acceptLocationFulfillerInvitationAction(token);
      expect(repeated).toMatchObject({
        success: true,
        destination: "/collaboration/tasks",
        alreadyAccepted: true,
      });

      const reopened = await getLocationFulfillerInvitationByToken(token);
      expect(reopened).toMatchObject({ status: "ACTIVE", acceptedAt: expect.any(Date) });
      await expect(
        prisma.locationFulfiller.findMany({
          where: { locationId: secondLocation.id, email: collaboratorEmail },
          select: { userId: true, status: true },
        })
      ).resolves.toEqual([{ userId: collaboratorId, status: "ACTIVE" }]);
      await expect(
        prisma.membership.count({ where: { organizationId, userId: collaboratorId } })
      ).resolves.toBe(0);
      await expect(
        prisma.locationAccess.count({
          where: { locationId: secondLocation.id, userId: collaboratorId },
        })
      ).resolves.toBe(1);
    } finally {
      process.env.ERP_DEV_USER_EMAIL = ownerEmail;
    }
  });
});

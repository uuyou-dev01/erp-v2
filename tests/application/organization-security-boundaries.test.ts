import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deactivateOrganizationMembershipAccess } from "@/lib/application/organization-membership-access";
import { organizationPairKey } from "@/lib/application/organization-connections";
import {
  getUnreadNotificationCount,
  markNotificationRead,
  reconcileNotificationResolutions,
} from "@/lib/application/notifications";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  activateServiceAgreementAction,
  createServiceAgreementAction,
} from "@/app/actions/multi-party";
import {
  getMyNotifications,
  getMyNotificationSummary,
  markMyNotificationReadAction,
} from "@/app/actions/notifications";

const runId = `organization_security_${Date.now()}`;
const ownerAEmail = `${runId}_owner_a@example.com`;
const ownerBEmail = `${runId}_owner_b@example.com`;
const memberEmail = `${runId}_member@example.com`;

let organizationAId = "";
let organizationBId = "";
let storeAId = "";
let storeBId = "";
let ownerAId = "";
let ownerBId = "";
let memberId = "";
let poolAId = "";
let channelAId = "";
let locationAId = "";
let taskId = "";

describe("organization security boundaries", () => {
  beforeAll(async () => {
    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: { code: `${runId}_A`, name: "Organization Security A" },
      }),
      prisma.organization.create({
        data: { code: `${runId}_B`, name: "Organization Security B" },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const [storeA, storeB] = await Promise.all([
      prisma.store.create({
        data: { organizationId: organizationAId, code: `${runId}_STORE_A`, name: "Store A" },
      }),
      prisma.store.create({
        data: { organizationId: organizationBId, code: `${runId}_STORE_B`, name: "Store B" },
      }),
    ]);
    storeAId = storeA.id;
    storeBId = storeB.id;

    const [ownerA, ownerB, member] = await Promise.all([
      prisma.user.create({
        data: { email: ownerAEmail, password: "test", role: "OWNER", storeId: storeAId },
      }),
      prisma.user.create({
        data: { email: ownerBEmail, password: "test", role: "OWNER", storeId: storeBId },
      }),
      prisma.user.create({
        data: { email: memberEmail, password: "test", role: "FULFILLMENT", storeId: storeAId },
      }),
    ]);
    ownerAId = ownerA.id;
    ownerBId = ownerB.id;
    memberId = member.id;

    await prisma.membership.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerAId, role: "OWNER", status: "ACTIVE" },
        { organizationId: organizationBId, userId: ownerBId, role: "OWNER", status: "ACTIVE" },
        {
          organizationId: organizationAId,
          userId: memberId,
          role: "FULFILLMENT",
          status: "ACTIVE",
        },
      ],
    });
    await prisma.storeAccess.createMany({
      data: [
        { storeId: storeAId, userId: ownerAId, role: "OWNER" },
        { storeId: storeBId, userId: ownerBId, role: "OWNER" },
        { storeId: storeAId, userId: memberId, role: "FULFILLMENT" },
      ],
      skipDuplicates: true,
    });

    poolAId = (await prisma.inventoryPool.findUniqueOrThrow({ where: { legacyStoreId: storeAId } }))
      .id;
    const channel = await prisma.salesChannelAccount.create({
      data: {
        organizationId: organizationAId,
        platformCode: "TEST",
        code: `${runId}_CHANNEL`,
        name: "Security Test Channel",
      },
    });
    channelAId = channel.id;
    const location = await prisma.location.create({
      data: {
        storeId: storeAId,
        operatorOrganizationId: organizationAId,
        code: `${runId}_LOCATION`,
        name: "Security Test Warehouse",
        type: "WAREHOUSE",
      },
    });
    locationAId = location.id;

    await Promise.all([
      prisma.inventoryPoolAccess.upsert({
        where: { inventoryPoolId_userId: { inventoryPoolId: poolAId, userId: memberId } },
        update: { role: "FULFILLMENT" },
        create: { inventoryPoolId: poolAId, userId: memberId, role: "FULFILLMENT" },
      }),
      prisma.channelAccess.create({
        data: { salesChannelAccountId: channelAId, userId: memberId, role: "FULFILLMENT" },
      }),
      prisma.locationAccess.upsert({
        where: { locationId_userId: { locationId: locationAId, userId: memberId } },
        update: { role: "FULFILLMENT" },
        create: { locationId: locationAId, userId: memberId, role: "FULFILLMENT" },
      }),
    ]);
    const task = await prisma.task.create({
      data: {
        organizationId: organizationAId,
        storeId: storeAId,
        type: "SHIP_ORDER",
        status: "IN_PROGRESS",
        title: "Member task",
        refType: "TEST",
        refId: runId,
        createdById: ownerAId,
        assignedToId: memberId,
        startedAt: new Date(),
      },
    });
    taskId = task.id;

    await prisma.organizationConnection.create({
      data: {
        requesterOrganizationId: organizationAId,
        targetOrganizationId: organizationBId,
        pairKey: organizationPairKey(organizationAId, organizationBId),
        status: "ACTIVE",
        requestedById: ownerAId,
        respondedById: ownerBId,
        respondedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.notification.deleteMany({
      where: { organizationId: { in: [organizationAId, organizationBId] } },
    });
    await prisma.task.deleteMany({ where: { id: taskId } });
    await prisma.serviceAgreement.deleteMany({
      where: {
        OR: [
          { clientOrganizationId: organizationAId },
          { providerOrganizationId: organizationBId },
        ],
      },
    });
    await prisma.organizationConnection.deleteMany({
      where: { pairKey: organizationPairKey(organizationAId, organizationBId) },
    });
    await prisma.salesChannelAccount.deleteMany({ where: { id: channelAId } });
    await prisma.inventoryPool.deleteMany({ where: { id: poolAId } });
    await prisma.store.deleteMany({ where: { id: { in: [storeAId, storeBId] } } });
    await prisma.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId, memberId] } } });
  });

  it("revokes every organization-derived scope and reopens unfinished tasks", async () => {
    await prisma.$transaction((tx) =>
      deactivateOrganizationMembershipAccess(tx, {
        organizationId: organizationAId,
        userId: memberId,
      })
    );

    const [membership, storeAccesses, poolAccesses, channelAccesses, locationAccesses, task] =
      await Promise.all([
        prisma.membership.findUniqueOrThrow({
          where: {
            organizationId_userId: { organizationId: organizationAId, userId: memberId },
          },
        }),
        prisma.storeAccess.count({ where: { userId: memberId, storeId: storeAId } }),
        prisma.inventoryPoolAccess.count({
          where: { userId: memberId, inventoryPoolId: poolAId },
        }),
        prisma.channelAccess.count({
          where: { userId: memberId, salesChannelAccountId: channelAId },
        }),
        prisma.locationAccess.count({ where: { userId: memberId, locationId: locationAId } }),
        prisma.task.findUniqueOrThrow({ where: { id: taskId } }),
      ]);
    expect(membership.status).toBe("INACTIVE");
    expect([storeAccesses, poolAccesses, channelAccesses, locationAccesses]).toEqual([0, 0, 0, 0]);
    expect(task).toMatchObject({ status: "OPEN", assignedToId: null, startedAt: null });
  });

  it("scopes notification reads and unread counts to the active organization", async () => {
    const [notificationA, notificationB] = await Promise.all([
      prisma.notification.create({
        data: {
          organizationId: organizationAId,
          recipientId: ownerAId,
          type: "TEST",
          title: "Organization A only",
        },
      }),
      prisma.notification.create({
        data: {
          organizationId: organizationBId,
          recipientId: ownerAId,
          type: "TEST",
          title: "Organization B only",
        },
      }),
    ]);

    await expect(getUnreadNotificationCount(ownerAId, organizationAId)).resolves.toBe(1);
    await expect(getUnreadNotificationCount(ownerAId, organizationBId)).resolves.toBe(1);
    const wrongOrganization = await markNotificationRead({
      notificationId: notificationB.id,
      recipientId: ownerAId,
      organizationId: organizationAId,
    });
    expect(wrongOrganization.count).toBe(0);
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: notificationB.id } })).readAt
    ).toBeNull();

    const correctOrganization = await markNotificationRead({
      notificationId: notificationA.id,
      recipientId: ownerAId,
      organizationId: organizationAId,
    });
    expect(correctOrganization.count).toBe(1);
    await expect(getUnreadNotificationCount(ownerAId, organizationAId)).resolves.toBe(0);
    await expect(getUnreadNotificationCount(ownerAId, organizationBId)).resolves.toBe(1);
  });

  it("shows cross-organization collaboration notifications in the recipient account inbox", async () => {
    process.env.ERP_DEV_USER_EMAIL = ownerAEmail;

    await expect(getMyNotificationSummary()).resolves.toMatchObject({ unreadCount: 1 });
    const notifications = await getMyNotifications();
    const external = notifications.find(
      (notification) => notification.organizationId === organizationBId
    );
    expect(external).toMatchObject({
      title: "Organization B only",
      organizationName: "Organization Security B",
    });
    expect(external).toBeDefined();
    if (!external) return;

    const marked = await markMyNotificationReadAction(external.id);
    expect(marked.success).toBe(true);
    await expect(getMyNotificationSummary()).resolves.toMatchObject({ unreadCount: 0 });
  });

  it("archives handled task notifications without marking them read", async () => {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: "IN_PROGRESS", assignedToId: memberId, startedAt: new Date() },
    });
    const notification = await prisma.notification.create({
      data: {
        organizationId: organizationAId,
        storeId: storeAId,
        recipientId: memberId,
        taskId,
        type: "TASK_ASSIGNED",
        title: "A handled task",
      },
    });

    await expect(reconcileNotificationResolutions(memberId)).resolves.toBe(1);
    await expect(
      prisma.notification.findUniqueOrThrow({ where: { id: notification.id } })
    ).resolves.toMatchObject({
      readAt: null,
      resolvedAt: expect.any(Date),
      resolutionCode: "TASK_STARTED",
      resolvedById: memberId,
    });
  });

  it("requires an active connection and confirmation by the counterparty", async () => {
    process.env.ERP_DEV_USER_EMAIL = ownerAEmail;
    const created = await createServiceAgreementAction({
      clientOrganizationId: organizationAId,
      providerOrganizationId: organizationBId,
      serviceTypes: ["FULFILLMENT"],
      settlementCurrency: "CNY",
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const pending = await prisma.serviceAgreement.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(pending).toMatchObject({
      status: "PENDING_COUNTERPARTY",
      proposedByOrganizationId: organizationAId,
      acceptedById: null,
    });

    const proposerAttempt = await activateServiceAgreementAction(created.id);
    expect(proposerAttempt.success).toBe(false);
    if (!proposerAttempt.success) expect(proposerAttempt.error).toContain("对方企业管理员");

    process.env.ERP_DEV_USER_EMAIL = ownerBEmail;
    const accepted = await activateServiceAgreementAction(created.id);
    expect(accepted.success).toBe(true);
    expect(
      await prisma.serviceAgreement.findUniqueOrThrow({ where: { id: created.id } })
    ).toMatchObject({
      status: "ACTIVE",
      acceptedById: ownerBId,
    });

    await prisma.organizationConnection.updateMany({
      where: { pairKey: organizationPairKey(organizationAId, organizationBId) },
      data: { status: "ENDED", endedAt: new Date() },
    });
    process.env.ERP_DEV_USER_EMAIL = ownerAEmail;
    const withoutConnection = await createServiceAgreementAction({
      clientOrganizationId: organizationAId,
      providerOrganizationId: organizationBId,
      serviceTypes: ["FULFILLMENT"],
      settlementCurrency: "CNY",
    });
    expect(withoutConnection.success).toBe(false);
    if (!withoutConnection.success) expect(withoutConnection.error).toContain("有效连接");
  });
});

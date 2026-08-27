import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { updateTeamMemberAccessAction } from "@/app/actions/team";
import { hasLocationCapability } from "@/lib/auth/scope-access";

const runId = `member_access_${Date.now()}`;
const ownerEmail = `${runId}_owner@example.com`;
const memberEmail = `${runId}_member@example.com`;
let organizationId = "";
let ownerId = "";
let memberId = "";
let storeAId = "";
let storeBId = "";
let locationAId = "";
let locationBId = "";

describe("team member access updates", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
    const organization = await prisma.organization.create({
      data: { code: `${runId}_ORG`, name: "Member Access Organization" },
    });
    organizationId = organization.id;
    const [storeA, storeB] = await Promise.all([
      prisma.store.create({
        data: { organizationId, code: `${runId}_A`, name: "Store A" },
      }),
      prisma.store.create({
        data: { organizationId, code: `${runId}_B`, name: "Store B" },
      }),
    ]);
    storeAId = storeA.id;
    storeBId = storeB.id;
    const [owner, member] = await Promise.all([
      prisma.user.create({
        data: { email: ownerEmail, password: "test", role: "OWNER", storeId: storeAId },
      }),
      prisma.user.create({
        data: { email: memberEmail, password: "test", role: "FULFILLMENT", storeId: storeAId },
      }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    await prisma.membership.createMany({
      data: [
        { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
        { organizationId, userId: memberId, role: "FULFILLMENT", status: "ACTIVE" },
      ],
    });
    await prisma.storeAccess.createMany({
      data: [
        { storeId: storeAId, userId: ownerId, role: "OWNER" },
        { storeId: storeBId, userId: ownerId, role: "OWNER" },
        { storeId: storeAId, userId: memberId, role: "FULFILLMENT" },
        { storeId: storeBId, userId: memberId, role: "FULFILLMENT" },
      ],
    });
    const [locationA, locationB] = await Promise.all([
      prisma.location.create({
        data: { storeId: storeAId, code: `${runId}_WH_A`, name: "Warehouse A", type: "WAREHOUSE" },
      }),
      prisma.location.create({
        data: { storeId: storeBId, code: `${runId}_WH_B`, name: "Warehouse B", type: "WAREHOUSE" },
      }),
    ]);
    locationAId = locationA.id;
    locationBId = locationB.id;
    await prisma.task.createMany({
      data: [
        {
          organizationId,
          storeId: storeAId,
          type: "SHIP_ORDER",
          status: "ASSIGNED",
          title: "Removed store shipment",
          refType: "TEST",
          refId: `${runId}_A`,
          createdById: ownerId,
          assignedToId: memberId,
        },
        {
          organizationId,
          storeId: storeBId,
          type: "SHIP_ORDER",
          status: "ASSIGNED",
          title: "Downgraded role shipment",
          refType: "TEST",
          refId: `${runId}_B`,
          createdById: ownerId,
          assignedToId: memberId,
        },
      ],
    });
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    if (organizationId) {
      await prisma.task.deleteMany({ where: { organizationId } });
      await prisma.store.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId].filter(Boolean) } } });
  });

  it("applies current role/store scope and revokes stale shipment access", async () => {
    const formData = new FormData();
    formData.set("userId", memberId);
    formData.set("role", "VIEWER");
    formData.append("storeIds", storeBId);
    const result = await updateTeamMemberAccessAction(formData);
    expect(result.success).toBe(true);

    const [membership, storeAccesses, locationAAccess, locationBAccess, assignedTasks] =
      await Promise.all([
        prisma.membership.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId, userId: memberId } },
        }),
        prisma.storeAccess.findMany({
          where: { userId: memberId, store: { organizationId } },
          select: { storeId: true, role: true },
        }),
        prisma.locationAccess.findUnique({
          where: { locationId_userId: { locationId: locationAId, userId: memberId } },
        }),
        prisma.locationAccess.findUnique({
          where: { locationId_userId: { locationId: locationBId, userId: memberId } },
        }),
        prisma.task.findMany({
          where: { organizationId, refType: "TEST" },
          select: { status: true, assignedToId: true },
        }),
      ]);

    expect(membership.role).toBe("VIEWER");
    expect(storeAccesses).toEqual([{ storeId: storeBId, role: "VIEWER" }]);
    expect(locationAAccess).toBeNull();
    expect(locationBAccess?.role).toBe("VIEWER");
    expect(assignedTasks).toEqual([
      { status: "OPEN", assignedToId: null },
      { status: "OPEN", assignedToId: null },
    ]);
  });

  it("keeps explicit warehouse scope current when new warehouses are added later", async () => {
    const formData = new FormData();
    formData.set("userId", memberId);
    formData.set("role", "FULFILLMENT");
    formData.append("storeIds", storeBId);
    formData.append("shipLocationIds", locationBId);
    const result = await updateTeamMemberAccessAction(formData);
    expect(result.success).toBe(true);
    await expect(hasLocationCapability(memberId, locationBId, "ship")).resolves.toBe(true);

    const newLocation = await prisma.location.create({
      data: {
        storeId: storeBId,
        code: `${runId}_WH_NEW`,
        name: "Warehouse added later",
        type: "WAREHOUSE",
      },
    });
    await expect(hasLocationCapability(memberId, newLocation.id, "ship")).resolves.toBe(false);
  });
});

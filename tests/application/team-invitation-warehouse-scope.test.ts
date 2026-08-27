import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInvitationToken, hashInvitationToken } from "@/lib/auth/invitation-token";
import { hasLocationCapability } from "@/lib/auth/scope-access";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn() }),
}));

import { acceptTeamInvitationAction } from "@/app/actions/organization-invitations";

const runId = `invitation_scope_${Date.now()}`;
const ownerEmail = `${runId}_owner@example.com`;
const memberEmail = `${runId}_member@example.com`;
const token = createInvitationToken();
let organizationId = "";
let storeId = "";
let ownerId = "";
let memberId = "";
let initialLocationId = "";

describe("team invitation warehouse scope", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `${runId}_ORG`, name: "Invitation Scope Organization" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: { organizationId, code: `${runId}_STORE`, name: "Invitation Store" },
    });
    storeId = store.id;
    const [owner, member] = await Promise.all([
      prisma.user.create({
        data: { email: ownerEmail, password: "test", role: "OWNER", storeId },
      }),
      prisma.user.create({
        data: { email: memberEmail, password: "test", role: "USER", storeId: null },
      }),
    ]);
    ownerId = owner.id;
    memberId = member.id;
    await prisma.membership.create({
      data: { organizationId, userId: ownerId, role: "OWNER", status: "ACTIVE" },
    });
    await prisma.storeAccess.create({ data: { storeId, userId: ownerId, role: "OWNER" } });
    const initialLocation = await prisma.location.create({
      data: {
        storeId,
        code: `${runId}_WH_INITIAL`,
        name: "Initial Warehouse",
        type: "WAREHOUSE",
      },
    });
    initialLocationId = initialLocation.id;
    await prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: memberEmail,
        role: "FULFILLMENT",
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        invitedById: ownerId,
        storeScopes: { create: { storeId } },
      },
    });
    process.env.ERP_DEV_USER_EMAIL = memberEmail;
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    if (organizationId) {
      await prisma.store.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, memberId].filter(Boolean) } } });
  });

  it("grants existing warehouses but not warehouses added after acceptance", async () => {
    const result = await acceptTeamInvitationAction(token);
    expect(result.success).toBe(true);
    await expect(hasLocationCapability(memberId, initialLocationId, "ship")).resolves.toBe(true);

    const laterLocation = await prisma.location.create({
      data: {
        storeId,
        code: `${runId}_WH_LATER`,
        name: "Later Warehouse",
        type: "WAREHOUSE",
      },
    });
    await expect(hasLocationCapability(memberId, laterLocation.id, "ship")).resolves.toBe(false);
  });
});

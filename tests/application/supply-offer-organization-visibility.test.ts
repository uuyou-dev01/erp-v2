import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { organizationPairKey } from "@/lib/application/organization-connections";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  changeSupplyOfferStatusAction,
  createSupplyOfferAction,
  getMarketplaceOffers,
  getSupplyOfferById,
} from "@/app/actions/supply-offers";

const runId = `org_visibility_${Date.now()}`;
const ownerEmail = `${runId}_owner@example.com`;
const resellerEmail = `${runId}_reseller@example.com`;
const outsiderEmail = `${runId}_outsider@example.com`;
const organizationIds: string[] = [];
const storeIds: string[] = [];
let offerId = "";

async function createIdentity(label: string, email: string) {
  const organization = await prisma.organization.create({
    data: { code: `${runId}_${label}`, name: `${label} organization` },
  });
  const store = await prisma.store.create({
    data: {
      organizationId: organization.id,
      code: `${runId}_${label}_store`,
      name: `${label} store`,
      currency: "CNY",
    },
  });
  const user = await prisma.user.create({
    data: { email, password: "test", role: "OWNER", storeId: store.id },
  });
  await prisma.membership.create({
    data: { organizationId: organization.id, userId: user.id, role: "OWNER", status: "ACTIVE" },
  });
  await prisma.storeAccess.create({ data: { storeId: store.id, userId: user.id, role: "OWNER" } });
  organizationIds.push(organization.id);
  storeIds.push(store.id);
  return { organization, store, user };
}

describe("supply offer organization visibility", () => {
  beforeAll(async () => {
    const owner = await createIdentity("owner", ownerEmail);
    const reseller = await createIdentity("reseller", resellerEmail);
    await createIdentity("outsider", outsiderEmail);

    await prisma.organizationConnection.create({
      data: {
        requesterOrganizationId: owner.organization.id,
        targetOrganizationId: reseller.organization.id,
        pairKey: organizationPairKey(owner.organization.id, reseller.organization.id),
        status: "ACTIVE",
        requestedById: owner.user.id,
        respondedById: reseller.user.id,
        respondedAt: new Date(),
      },
    });

    const location = await prisma.location.create({
      data: {
        storeId: owner.store.id,
        code: `${runId}_location`,
        name: "Owner stock",
        type: "WAREHOUSE",
      },
    });
    const sku = await prisma.sKU.create({
      data: { storeId: owner.store.id, code: `${runId}_sku`, name: "Private resale item" },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: owner.store.id,
        skuId: sku.id,
        locationId: location.id,
        unitCost: "88",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: runId,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: {
        storeId: owner.store.id,
        entityType: "LOT",
        entityId: lot.id,
        locationId: location.id,
        deltaQty: "2",
        reason: "PURCHASE_IN",
      },
    });
    process.env.ERP_DEV_USER_EMAIL = ownerEmail;
    const result = await createSupplyOfferAction({
      storeId: owner.store.id,
      title: "Only for the linked reseller organization",
      visibility: "PARTNER_ONLY",
      viewerOrganizationIds: [reseller.organization.id],
      currency: "CNY",
      unitPrice: "120",
      agreementTerms: "双方确认：每成交一件，货主收取 CNY 120，其他收益由代卖方保留。",
      items: [
        {
          skuId: sku.id,
          title: sku.name,
          quantityAvailable: "2",
          unitPrice: "120",
          currency: "CNY",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    offerId = result.id;
    const visibilityRule = await prisma.offerVisibility.findFirstOrThrow({
      where: { offerId },
    });
    expect(visibilityRule.viewerOrganizationId).toBe(reseller.organization.id);
    expect(visibilityRule.organizationConnectionId).toBeTruthy();
    expect(visibilityRule.partnerId).toBeNull();
    expect((await changeSupplyOfferStatusAction(offerId, "PUBLISHED")).success).toBe(true);
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.organizationConnection.deleteMany({
      where: {
        OR: [
          { requesterOrganizationId: { in: organizationIds } },
          { targetOrganizationId: { in: organizationIds } },
        ],
      },
    });
    await prisma.store.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
  });

  it("lets the linked reseller organization list and open the offer", async () => {
    process.env.ERP_DEV_USER_EMAIL = resellerEmail;
    expect((await getMarketplaceOffers()).map((offer) => offer.id)).toContain(offerId);
    const detail = await getSupplyOfferById(offerId);
    expect(detail?.id).toBe(offerId);
    expect(JSON.stringify(detail)).not.toContain('"unitCost"');
  });

  it("does not expose the targeted offer to an unrelated organization", async () => {
    process.env.ERP_DEV_USER_EMAIL = outsiderEmail;
    expect((await getMarketplaceOffers()).map((offer) => offer.id)).not.toContain(offerId);
    expect(await getSupplyOfferById(offerId)).toBeNull();
  });

  it("revokes organization-targeted visibility when the source connection ends", async () => {
    await prisma.organizationConnection.updateMany({
      where: {
        OR: [
          { requesterOrganizationId: organizationIds[0], targetOrganizationId: organizationIds[1] },
          { requesterOrganizationId: organizationIds[1], targetOrganizationId: organizationIds[0] },
        ],
      },
      data: { status: "ENDED", endedAt: new Date() },
    });
    process.env.ERP_DEV_USER_EMAIL = resellerEmail;
    expect((await getMarketplaceOffers()).map((offer) => offer.id)).not.toContain(offerId);
    expect(await getSupplyOfferById(offerId)).toBeNull();
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import {
  createChargeEventAction,
  createSettlementFromChargesAction,
  transitionChargeEventAction,
} from "@/app/actions/charges";
import { ensureSystemChargeCategories } from "@/lib/application/multi-party-foundation";
import { requireUserContext } from "@/lib/auth/user-context";
import { getLocationStats } from "@/app/actions/locations";
import {
  addPurchaseLineAction,
  createPurchaseOrderAction,
  getWarehouseInboundTasks,
  inspectExternalPurchaseReceiptAction,
  receivePurchaseOrderAction,
} from "@/app/actions/purchase-orders";
import {
  confirmChannelStatementAction,
  importChannelStatementCsvAction,
  reconcileChannelStatementAction,
} from "@/app/actions/channel-statements";
import {
  authorizeAfterSalesCaseAction,
  createAfterSalesCaseAction,
  receiveAfterSalesReturnAction,
  resolveAfterSalesCaseAction,
} from "@/app/actions/after-sales";
import {
  changeSupplyOfferStatusAction,
  createSupplyOfferAction,
} from "@/app/actions/supply-offers";
import {
  changeResaleListingStatusAction,
  createResaleListingAction,
} from "@/app/actions/resale-listings";
import {
  createResaleOrderFulfillmentAction,
  getFulfillmentRequestById,
  updateFulfillmentRequestStatusAction,
} from "@/app/actions/fulfillment-requests";
import { changeSettlementStatusAction, createSettlementFromFulfillmentAction } from "@/app/actions/settlements";

const runId = `multi_party_${Date.now()}`;
const clientEmail = `${runId}_client@example.com`;
const providerEmail = `${runId}_provider@example.com`;

let clientOrganizationId = "";
let providerOrganizationId = "";
let clientStoreId = "";
let providerStoreId = "";
let clientPoolId = "";
let providerLocationId = "";
let chargeEventId = "";
let clientChannelId = "";
let clientPlatformId = "";
let channelOrderId = "";

describe("multi-party warehouse collaboration", () => {
  beforeAll(async () => {
    const clientOrganization = await prisma.organization.create({ data: { code: `${runId}_CLIENT`, name: "Client Organization" } });
    const providerOrganization = await prisma.organization.create({ data: { code: `${runId}_PROVIDER`, name: "Provider Organization" } });
    clientOrganizationId = clientOrganization.id;
    providerOrganizationId = providerOrganization.id;

    const clientStore = await prisma.store.create({ data: { organizationId: clientOrganization.id, code: `${runId}_CS`, name: "Client Legacy Store", currency: "CNY" } });
    const providerStore = await prisma.store.create({ data: { organizationId: providerOrganization.id, code: `${runId}_PS`, name: "Provider Legacy Store", currency: "CNY" } });
    clientStoreId = clientStore.id;
    providerStoreId = providerStore.id;

    const clientUser = await prisma.user.create({ data: { email: clientEmail, password: "test", role: "OWNER", storeId: clientStore.id } });
    const providerUser = await prisma.user.create({ data: { email: providerEmail, password: "test", role: "OWNER", storeId: providerStore.id } });
    await prisma.membership.createMany({ data: [
      { organizationId: clientOrganization.id, userId: clientUser.id, role: "OWNER", status: "ACTIVE" },
      { organizationId: providerOrganization.id, userId: providerUser.id, role: "OWNER", status: "ACTIVE" },
    ] });
    await prisma.storeAccess.createMany({ data: [
      { storeId: clientStore.id, userId: clientUser.id, role: "OWNER" },
      { storeId: providerStore.id, userId: providerUser.id, role: "OWNER" },
    ] });

    const pool = await prisma.inventoryPool.findUniqueOrThrow({ where: { legacyStoreId: clientStore.id } });
    clientPoolId = pool.id;
    const location = await prisma.location.create({ data: { storeId: providerStore.id, code: `${runId}_WH`, name: "Friend Warehouse", type: "WAREHOUSE" } });
    providerLocationId = location.id;
    await prisma.locationCapability.create({
      data: { locationId: location.id, code: "DIRECT_FULFILLMENT" },
    });
    await prisma.shippingLane.create({
      data: {
        storeId: providerStore.id,
        fromLocationId: location.id,
        laneType: "CUSTOMER_DELIVERY",
        destinationCountry: "CN",
      },
    });
    await prisma.inventoryPoolAccess.create({ data: { inventoryPoolId: pool.id, userId: providerUser.id, role: "OPERATOR", permissions: { receive: true, ship: true, viewCost: false } } });
    await prisma.locationAccess.upsert({
      where: { locationId_userId: { locationId: location.id, userId: providerUser.id } },
      update: { role: "OPERATOR", permissions: { receive: true, ship: true } },
      create: { locationId: location.id, userId: providerUser.id, role: "OPERATOR", permissions: { receive: true, ship: true } },
    });
    await prisma.serviceAgreement.create({ data: { clientOrganizationId: clientOrganization.id, providerOrganizationId: providerOrganization.id, inventoryPoolId: pool.id, locationId: location.id, serviceTypes: ["RECEIVING", "INSPECTION", "FULFILLMENT"], settlementCurrency: "CNY" } });
    const platform = await prisma.platform.create({ data: { storeId: clientStore.id, code: `${runId}_CHANNEL`, name: "Test Channel", country: "CN", defaultCurrency: "CNY" } });
    clientPlatformId = platform.id;
    clientChannelId = (await prisma.salesChannelAccount.findUniqueOrThrow({ where: { legacyPlatformId: platform.id } })).id;
    await ensureSystemChargeCategories();
  });

  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.settlement.deleteMany({ where: { OR: [{ payerOrganizationId: clientOrganizationId }, { payeeOrganizationId: providerOrganizationId }] } });
    await prisma.afterSalesCase.deleteMany({ where: { organizationId: clientOrganizationId } });
    await prisma.chargeEvent.deleteMany({ where: { OR: [{ sourceId: { startsWith: runId } }, { organizationId: { in: [clientOrganizationId, providerOrganizationId] } }] } });
    await prisma.channelStatement.deleteMany({ where: { organizationId: clientOrganizationId } });
    await prisma.serviceAgreement.deleteMany({ where: { OR: [{ clientOrganizationId }, { providerOrganizationId }] } });
    await prisma.location.deleteMany({ where: { id: providerLocationId } });
    await prisma.salesChannelAccount.deleteMany({ where: { organizationId: { in: [clientOrganizationId, providerOrganizationId] } } });
    await prisma.inventoryPool.deleteMany({ where: { organizationId: { in: [clientOrganizationId, providerOrganizationId] } } });
    await prisma.store.deleteMany({ where: { id: { in: [clientStoreId, providerStoreId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [clientOrganizationId, providerOrganizationId] } } });
  });

  it("dual-writes a client-owned lot stored at the provider warehouse", async () => {
    const sku = await prisma.sKU.create({ data: { storeId: clientStoreId, code: `${runId}_SKU`, name: "Client-owned Toy" } });
    const lot = await prisma.inventoryLot.create({ data: { storeId: clientStoreId, skuId: sku.id, locationId: providerLocationId, unitCost: "20", costCurrency: "CNY", sourceType: "PURCHASE", sourceId: runId, receivedAt: new Date() } });
    const ledger = await prisma.stockLedger.create({ data: { storeId: clientStoreId, entityType: "LOT", entityId: lot.id, locationId: providerLocationId, deltaQty: "3", reason: "PURCHASE_IN", refType: "TEST", refId: runId } });
    expect(sku.inventoryPoolId).toBe(clientPoolId);
    expect(lot.inventoryPoolId).toBe(clientPoolId);
    expect(ledger.inventoryPoolId).toBe(clientPoolId);
    expect((await prisma.location.findUniqueOrThrow({ where: { id: providerLocationId } })).operatorOrganizationId).toBe(providerOrganizationId);
    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const warehouseView = await getLocationStats(providerLocationId);
    expect(warehouseView.lotStockQty).toBe(3);
    expect(JSON.stringify(warehouseView)).not.toContain("unitCost");
  });

  it("does not share login/admin scope but permits explicit cross-organization pool access", async () => {
    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const context = await requireUserContext();
    expect(context.organizationId).toBe(providerOrganizationId);
    expect(context.organizationIds).toEqual([providerOrganizationId]);
    expect(context.inventoryPoolIds).toContain(clientPoolId);
    expect(context.storeIds).not.toContain(clientStoreId);
  });

  it("lets the client purchase into the provider warehouse without exposing purchase costs in the inbox", async () => {
    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const sku = await prisma.sKU.create({ data: { storeId: clientStoreId, code: `${runId}_INBOUND_SKU`, name: "Inbound Toy" } });
    const created = await createPurchaseOrderAction({ storeId: clientStoreId, orderNo: `${runId}_PO`, supplierName: "Private Supplier", currency: "CNY", destinationLocationId: providerLocationId });
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect((await addPurchaseLineAction({ purchaseOrderId: created.id, skuId: sku.id, quantity: "2", unitPrice: "25" })).success).toBe(true);
    await prisma.purchaseOrder.update({ where: { id: created.id }, data: { status: "ORDERED" } });

    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const tasks = await getWarehouseInboundTasks();
    const task = tasks.find((item) => item.id === created.id);
    expect(task?.lines[0]).toMatchObject({ quantity: "2", sku: { name: "Inbound Toy" } });
    expect(JSON.stringify(task)).not.toContain("unitPrice");
    expect(JSON.stringify(task)).not.toContain("Private Supplier");
    expect((await receivePurchaseOrderAction({ purchaseOrderId: created.id, locationId: providerLocationId, receivedAt: new Date() })).success).toBe(true);
    const receivedLot = await prisma.inventoryLot.findFirstOrThrow({ where: { sourceType: "PURCHASE", sourceId: { in: (await prisma.purchaseLine.findMany({ where: { purchaseOrderId: created.id }, select: { id: true } })).map((line) => line.id) } } });
    expect(receivedLot.status).toBe("RETURN_CHECK");
    expect((await inspectExternalPurchaseReceiptAction({ purchaseOrderId: created.id, result: "PASSED" })).success).toBe(true);
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: receivedLot.id } })).status).toBe("ACTIVE");
  });

  it("forms a payable only after provider submission and client confirmation", async () => {
    const category = await prisma.chargeCategory.findFirstOrThrow({ where: { organizationId: null, code: "SHIPPING" } });
    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const created = await createChargeEventAction({
      categoryId: category.id,
      sourceType: "FULFILLMENT_REQUEST",
      sourceId: `${runId}_fulfillment`,
      idempotencyKey: `${runId}_shipping`,
      amountKind: "ACTUAL",
      amount: "28.50",
      currency: "CNY",
      description: "Provider-paid shipping reimbursement",
      submit: true,
      parties: [
        { role: "PAYER", partyType: "ORGANIZATION", partyId: clientOrganizationId, organizationId: clientOrganizationId, name: "Client Organization" },
        { role: "PAYEE", partyType: "ORGANIZATION", partyId: providerOrganizationId, organizationId: providerOrganizationId, name: "Provider Organization" },
      ],
      allocations: [{ targetType: "FULFILLMENT_REQUEST", targetId: `${runId}_fulfillment`, amount: "28.50" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    chargeEventId = created.id;
    expect((await prisma.chargeEvent.findUniqueOrThrow({ where: { id: chargeEventId } })).status).toBe("SUBMITTED");

    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const confirmed = await transitionChargeEventAction(chargeEventId, "CONFIRMED");
    expect(confirmed.success).toBe(true);
    const settlement = await createSettlementFromChargesAction([chargeEventId]);
    expect(settlement.success).toBe(true);
    const persisted = await prisma.settlement.findFirstOrThrow({ where: { items: { some: { chargeEventId } } }, include: { items: true } });
    expect(persisted.payerOrganizationId).toBe(clientOrganizationId);
    expect(persisted.payeeOrganizationId).toBe(providerOrganizationId);
    expect(persisted.totalAmount.toString()).toBe("28.5");
    expect(persisted.status).toBe("DRAFT");

    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const payeeAttempt = await changeSettlementStatusAction(persisted.id, "CONFIRMED");
    expect(payeeAttempt.success).toBe(false);
    if (!payeeAttempt.success) expect(payeeAttempt.error).toContain("收款方仅可查看");
    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    expect((await changeSettlementStatusAction(persisted.id, "CONFIRMED")).success).toBe(true);
  });

  it("routes configured dropship and shipping fees to the actual provider without duplicating the supply settlement", async () => {
    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const sku = await prisma.sKU.create({
      data: { storeId: clientStoreId, code: `${runId}_DROPSHIP_SKU`, name: "Dropship Camera", imageUrl: "https://example.com/camera.jpg" },
    });
    const lot = await prisma.inventoryLot.create({
      data: {
        storeId: clientStoreId,
        skuId: sku.id,
        locationId: providerLocationId,
        unitCost: "300",
        costCurrency: "CNY",
        sourceType: "PURCHASE",
        sourceId: `${runId}_dropship_lot`,
        receivedAt: new Date(),
      },
    });
    await prisma.stockLedger.create({
      data: { storeId: clientStoreId, entityType: "LOT", entityId: lot.id, locationId: providerLocationId, deltaQty: "2", reason: "PURCHASE_IN", refType: "TEST", refId: `${runId}_dropship_stock` },
    });
    const offer = await createSupplyOfferAction({
      storeId: clientStoreId,
      title: "Third-party fulfillment offer",
      visibility: "PRIVATE",
      unitPrice: "600",
      currency: "CNY",
      dropshipFee: "120",
      dropshipFeeCurrency: "CNY",
      agreementTerms: "货主收取供货价，代发服务费和实际运费另行支付给服务主体。",
      fulfillmentMode: "THIRD_PARTY_SHIPS",
      providerOrganizationId,
      shipFromLocation: providerLocationId,
      items: [{ skuId: sku.id, title: "Dropship Camera", quantityAvailable: "2", unitPrice: "600", currency: "CNY" }],
    });
    expect(offer.success).toBe(true);
    if (!offer.success) return;
    expect((await changeSupplyOfferStatusAction(offer.id, "PUBLISHED")).success).toBe(true);

    const resale = await createResaleListingAction({
      storeId: clientStoreId,
      supplyOfferId: offer.id,
      platformId: clientPlatformId,
      title: "Dropship Camera Listing",
      targetPrice: "1000",
      quantityPlanned: "2",
    });
    expect(resale.success).toBe(true);
    if (!resale.success) return;
    expect((await changeResaleListingStatusAction(resale.id, "ACTIVE")).success).toBe(true);
    const sold = await createResaleOrderFulfillmentAction({
      storeId: clientStoreId,
      resaleListingId: resale.id,
      quantity: "1",
      customerName: "Dropship Buyer",
      shippingAddress: "Shanghai",
      shippingCountry: "CN",
    });
    expect(sold.success).toBe(true);
    if (!sold.success) return;

    const requesterAcceptAttempt = await updateFulfillmentRequestStatusAction(sold.fulfillmentRequestId, "ACCEPTED");
    expect(requesterAcceptAttempt.success).toBe(false);
    if (!requesterAcceptAttempt.success) expect(requesterAcceptAttempt.error).toContain("只有服务方");

    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    const providerRequestView = await getFulfillmentRequestById(sold.fulfillmentRequestId);
    expect(providerRequestView?.supplyOffer.organization?.name).toBe("Client Organization");
    expect(providerRequestView?.supplyOffer.organization?.name).not.toBe("Provider Organization");
    expect((await updateFulfillmentRequestStatusAction(sold.fulfillmentRequestId, "ACCEPTED")).success).toBe(true);
    const shipped = await updateFulfillmentRequestStatusAction(sold.fulfillmentRequestId, "SHIPPED", {
      carrier: "Provider Express",
      trackingNo: `${runId}_TRACKING`,
      shippingFee: "50",
      serviceFee: "80",
      shippingCurrency: "CNY",
    });
    expect(shipped.success).toBe(true);

    const providerCharges = await prisma.chargeEvent.findMany({
      where: { organizationId: providerOrganizationId, sourceType: "FULFILLMENT_REQUEST", sourceId: sold.fulfillmentRequestId },
      include: { category: true, parties: true },
    });
    expect(providerCharges.map((charge) => [charge.category.code, charge.amount.toString()]).sort()).toEqual([
      ["FULFILLMENT", "80"],
      ["SHIPPING", "50"],
    ]);
    expect(providerCharges.every((charge) => charge.parties.some((party) => party.role === "PAYEE" && party.organizationId === providerOrganizationId))).toBe(true);

    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const settlementResult = await createSettlementFromFulfillmentAction(sold.fulfillmentRequestId, clientStoreId);
    expect(settlementResult.success).toBe(true);
    if (!settlementResult.success) return;
    const settlement = await prisma.settlement.findUniqueOrThrow({ where: { id: settlementResult.id }, include: { lines: true } });
    expect(settlement.payeeOrganizationId).toBe(clientOrganizationId);
    expect(settlement.totalAmount.toString()).toBe("600");
    expect(settlement.lines.find((line) => line.lineType === "FULFILLMENT_FEE")?.direction).toBe("INFORMATIONAL");
    expect(settlement.lines.find((line) => line.lineType === "FULFILLMENT_FEE")?.amount.toString()).toBe("80");
    expect(settlement.lines.find((line) => line.lineType === "SHIPPING_FEE")?.direction).toBe("INFORMATIONAL");
    expect(settlement.lines.find((line) => line.lineType === "SHIPPING_FEE")?.amount.toString()).toBe("50");
  });

  it("reconciles channel gross sales, deductions and payout without overwriting order gross", async () => {
    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const channel = await prisma.salesChannelAccount.findUniqueOrThrow({ where: { id: clientChannelId } });
    const order = await prisma.customerOrder.create({
      data: {
        storeId: clientStoreId,
        platformId: channel.legacyPlatformId,
        orderNumber: `${runId}_ORDER`,
        externalOrderNo: `${runId}_EXT`,
        customerName: "Channel Buyer",
        shippingAddress: "Test Address",
        orderDate: new Date(),
        currency: "CNY",
        subtotal: "100",
        totalPaid: "100",
        orderStatus: "SHIPPED",
      },
    });
    channelOrderId = order.id;
    const imported = await importChannelStatementCsvAction({
      salesChannelAccountId: clientChannelId,
      externalStatementNo: `${runId}_STATEMENT`,
      currency: "CNY",
      rawCsv: [
        "externalLineId,lineType,externalOrderNo,amount,currency,description",
        `1,ORDER_GROSS,${runId}_EXT,100,CNY,成交毛额`,
        `2,PLATFORM_FEE,${runId}_EXT,-10,CNY,平台费`,
        "3,PAYOUT,,90,CNY,净到账",
      ].join("\n"),
    });
    expect(imported.success).toBe(true);
    if (!imported.success) return;
    const reconciled = await reconcileChannelStatementAction(imported.id);
    expect(reconciled).toMatchObject({ success: true, matched: 2, exceptions: 0 });
    expect((await confirmChannelStatementAction(imported.id)).success).toBe(true);
    const persistedOrder = await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(persistedOrder.totalPaid.toString()).toBe("100");
    const fee = await prisma.chargeEvent.findFirstOrThrow({ where: { sourceType: "CHANNEL_STATEMENT_LINE", organizationId: clientOrganizationId } });
    expect(fee.amount.toString()).toBe("10");
    expect(fee.amountKind).toBe("ACTUAL");
    expect(fee.status).toBe("CONFIRMED");
  });

  it("keeps a partial return unavailable until the provider receives and passes inspection", async () => {
    process.env.ERP_DEV_USER_EMAIL = clientEmail;
    const sku = await prisma.sKU.create({ data: { storeId: clientStoreId, code: `${runId}_RETURN_SKU`, name: "Returnable Toy" } });
    const lot = await prisma.inventoryLot.create({ data: { storeId: clientStoreId, skuId: sku.id, locationId: providerLocationId, unitCost: "30", costCurrency: "CNY", sourceType: "PURCHASE", sourceId: `${runId}_return_source`, receivedAt: new Date(), status: "CONSUMED" } });
    const line = await prisma.orderLine.create({ data: { orderId: channelOrderId, skuId: sku.id, quantity: "2", unitPrice: "50", lineAmount: "100" } });
    const allocation = await prisma.orderAllocation.create({ data: { orderLineId: line.id, allocationType: "LOT", lotId: lot.id, quantity: "2", unitCost: "30", costAmount: "60", status: "CONSUMED" } });
    const created = await createAfterSalesCaseAction({ customerOrderId: channelOrderId, type: "RETURN", reason: "部分退货", refundAmount: "50", refundCurrency: "CNY", targetLocationId: providerLocationId, lines: [{ orderLineId: line.id, quantity: "1" }] });
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect((await authorizeAfterSalesCaseAction(created.id)).success).toBe(true);

    process.env.ERP_DEV_USER_EMAIL = providerEmail;
    expect((await receiveAfterSalesReturnAction(created.id)).success).toBe(true);
    const receipt = await prisma.afterSalesReceipt.findFirstOrThrow({ where: { orderAllocationId: allocation.id } });
    const returnedLot = await prisma.inventoryLot.findUniqueOrThrow({ where: { id: receipt.returnedLotId! } });
    expect(returnedLot.status).toBe("RETURN_CHECK");
    expect((await resolveAfterSalesCaseAction(created.id, { resolution: "RESTOCK", note: "检查通过" })).success).toBe(true);
    expect((await prisma.inventoryLot.findUniqueOrThrow({ where: { id: returnedLot.id } })).status).toBe("ACTIVE");
    const refund = await prisma.chargeEvent.findFirstOrThrow({ where: { idempotencyKey: `after-sales-refund:${created.id}` } });
    expect(refund.amount.toString()).toBe("50");
    expect(refund.status).toBe("CONFIRMED");
  });
});

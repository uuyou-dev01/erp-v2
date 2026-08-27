import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../../lib/auth/password";
import { assertSafeTestDatabaseUrl } from "../../../lib/database/database-url-guard";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const identity = assertSafeTestDatabaseUrl(testDatabaseUrl);
if (process.env.DATABASE_URL !== testDatabaseUrl) {
  throw new Error("E2E fixture 的 DATABASE_URL 必须与已校验的 TEST_DATABASE_URL 完全一致");
}

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "e2e-owner@example.invalid";
  const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? "e2e-owner-password-7fd243e68c2d4b33";
  const organization = await prisma.organization.upsert({
    where: { code: "e2e-main" },
    update: { name: "E2E 默认经营主体" },
    create: { name: "E2E 默认经营主体", code: "e2e-main" },
  });
  const store = await prisma.store.upsert({
    where: { id: "store_1" },
    update: { organizationId: organization.id, name: "E2E 默认店铺", currency: "CNY" },
    create: {
      id: "store_1",
      organizationId: organization.id,
      code: "STORE_1",
      name: "E2E 默认店铺",
      currency: "CNY",
    },
  });
  const admin = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      role: "OWNER",
      storeId: store.id,
      password: await hashPassword(ownerPassword),
    },
    create: {
      email: ownerEmail,
      name: "E2E 管理员",
      password: await hashPassword(ownerPassword),
      role: "OWNER",
      storeId: store.id,
    },
  });
  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: admin.id } },
    update: { role: "OWNER", status: "ACTIVE" },
    create: { organizationId: organization.id, userId: admin.id, role: "OWNER" },
  });
  await prisma.storeAccess.upsert({
    where: { storeId_userId: { storeId: store.id, userId: admin.id } },
    update: { role: "OWNER" },
    create: { storeId: store.id, userId: admin.id, role: "OWNER" },
  });

  const inventoryPool = await prisma.inventoryPool.upsert({
    where: { legacyStoreId: store.id },
    update: {
      organizationId: organization.id,
      code: "E2E_MAIN_POOL",
      name: "E2E 默认库存池",
      baseCurrency: "CNY",
      status: "ACTIVE",
    },
    create: {
      organizationId: organization.id,
      legacyStoreId: store.id,
      code: "E2E_MAIN_POOL",
      name: "E2E 默认库存池",
      baseCurrency: "CNY",
      status: "ACTIVE",
    },
  });
  await prisma.inventoryPoolAccess.upsert({
    where: {
      inventoryPoolId_userId: {
        inventoryPoolId: inventoryPool.id,
        userId: admin.id,
      },
    },
    update: { role: "OWNER" },
    create: { inventoryPoolId: inventoryPool.id, userId: admin.id, role: "OWNER" },
  });

  await prisma.partner.upsert({
    where: { storeId_code: { storeId: store.id, code: "E2E-QA-SUPPLIER" } },
    update: {
      organizationId: organization.id,
      name: "E2E QA 基础供应商",
      type: "SUPPLIER",
      status: "ACTIVE",
      defaultCurrency: "CNY",
    },
    create: {
      storeId: store.id,
      organizationId: organization.id,
      code: "E2E-QA-SUPPLIER",
      name: "E2E QA 基础供应商",
      type: "SUPPLIER",
      status: "ACTIVE",
      defaultCurrency: "CNY",
    },
  });

  const locations = [
    { code: "E2E-WH-CN", name: "E2E 中国可售仓", type: "WAREHOUSE", region: "CN_SHANGHAI" },
    { code: "E2E-WH-JP", name: "E2E 日本可售仓", type: "WAREHOUSE", region: "JP_TOKYO" },
    { code: "E2E-FWD-JP", name: "E2E 日本转运仓", type: "FORWARDER", region: "JP_TOKYO" },
  ];
  let qaSellableLocationId = "";
  for (const location of locations) {
    const saved = await prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: location.code } },
      update: {
        ...location,
        operatorOrganizationId: organization.id,
        isSellableDefault: location.type !== "FORWARDER",
      },
      create: {
        storeId: store.id,
        ...location,
        operatorOrganizationId: organization.id,
        isSellableDefault: location.type !== "FORWARDER",
      },
    });
    if (location.code === "E2E-WH-CN") qaSellableLocationId = saved.id;
    await prisma.locationAccess.upsert({
      where: { locationId_userId: { locationId: saved.id, userId: admin.id } },
      update: { role: "OWNER" },
      create: { locationId: saved.id, userId: admin.id, role: "OWNER" },
    });
    const capabilities =
      location.type === "FORWARDER"
        ? ["RECEIVE", "STORE", "CONSOLIDATE", "TRANSFER"]
        : ["RECEIVE", "STORE", "INSPECT", "TRANSFER", "DIRECT_FULFILLMENT", "RETURNS"];
    for (const code of capabilities) {
      await prisma.locationCapability.upsert({
        where: { locationId_code: { locationId: saved.id, code } },
        update: { enabled: true },
        create: { locationId: saved.id, code, enabled: true },
      });
    }
    if (location.type !== "FORWARDER") {
      const destinationCountry = location.region.startsWith("JP") ? "JP" : "CN";
      const existingLane = await prisma.shippingLane.findFirst({
        where: {
          fromLocationId: saved.id,
          toLocationId: null,
          laneType: "CUSTOMER_DELIVERY",
          destinationCountry,
          serviceLevel: "STANDARD",
        },
        select: { id: true },
      });
      if (existingLane) {
        await prisma.shippingLane.update({
          where: { id: existingLane.id },
          data: { storeId: store.id, active: true },
        });
      } else {
        await prisma.shippingLane.create({
          data: {
            storeId: store.id,
            fromLocationId: saved.id,
            laneType: "CUSTOMER_DELIVERY",
            destinationCountry,
            serviceLevel: "STANDARD",
            active: true,
          },
        });
      }
    }
  }

  if (!qaSellableLocationId) {
    throw new Error("E2E QA 可售仓 fixture 创建失败");
  }

  const qaSku = await prisma.sKU.upsert({
    where: { storeId_code: { storeId: store.id, code: "E2E-QA-STOCK-001" } },
    update: {
      inventoryPoolId: inventoryPool.id,
      name: "E2E QA 基础库存商品",
    },
    create: {
      storeId: store.id,
      inventoryPoolId: inventoryPool.id,
      code: "E2E-QA-STOCK-001",
      name: "E2E QA 基础库存商品",
    },
  });
  const qaLot = await prisma.inventoryLot.upsert({
    where: { id: "e2e_qa_inventory_lot_001" },
    update: {
      storeId: store.id,
      inventoryPoolId: inventoryPool.id,
      skuId: qaSku.id,
      locationId: qaSellableLocationId,
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "E2E_FIXTURE",
      sourceId: "e2e_qa_fixture_stock_001",
      receivedAt: new Date("2026-08-28T00:00:00.000Z"),
      status: "ACTIVE",
    },
    create: {
      id: "e2e_qa_inventory_lot_001",
      storeId: store.id,
      inventoryPoolId: inventoryPool.id,
      skuId: qaSku.id,
      locationId: qaSellableLocationId,
      unitCost: "100",
      costCurrency: "CNY",
      sourceType: "E2E_FIXTURE",
      sourceId: "e2e_qa_fixture_stock_001",
      receivedAt: new Date("2026-08-28T00:00:00.000Z"),
      status: "ACTIVE",
    },
  });
  await prisma.stockLedger.upsert({
    where: { id: "e2e_qa_stock_ledger_001" },
    update: {
      storeId: store.id,
      inventoryPoolId: inventoryPool.id,
      entityType: "LOT",
      entityId: qaLot.id,
      locationId: qaSellableLocationId,
      deltaQty: "10",
      reason: "INBOUND_PURCHASE",
      refType: "E2E_FIXTURE",
      refId: "e2e_qa_fixture_stock_001",
    },
    create: {
      id: "e2e_qa_stock_ledger_001",
      storeId: store.id,
      inventoryPoolId: inventoryPool.id,
      entityType: "LOT",
      entityId: qaLot.id,
      locationId: qaSellableLocationId,
      deltaQty: "10",
      reason: "INBOUND_PURCHASE",
      refType: "E2E_FIXTURE",
      refId: "e2e_qa_fixture_stock_001",
    },
  });

  for (const platform of [
    { code: "MERCARI", name: "Mercari", country: "JP", defaultCurrency: "JPY" },
    { code: "XIAN_YU", name: "闲鱼", country: "CN", defaultCurrency: "CNY" },
  ]) {
    await prisma.platform.upsert({
      where: { storeId_code: { storeId: store.id, code: platform.code } },
      update: platform,
      create: { storeId: store.id, defaultFeeRate: 0, ...platform },
    });
  }

  const fxEffectiveDate = new Date("2026-08-01T00:00:00.000Z");
  for (const fx of [
    { fromCurrency: "CNY", toCurrency: "JPY", rate: "20.50000000" },
    { fromCurrency: "JPY", toCurrency: "CNY", rate: "0.04880000" },
  ]) {
    await prisma.fxRate.upsert({
      where: {
        fromCurrency_toCurrency_effectiveDate: {
          fromCurrency: fx.fromCurrency,
          toCurrency: fx.toCurrency,
          effectiveDate: fxEffectiveDate,
        },
      },
      update: { rate: fx.rate },
      create: { ...fx, effectiveDate: fxEffectiveDate },
    });
  }

  console.log(`E2E 基础 fixture 已就绪：${identity.safeLabel}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

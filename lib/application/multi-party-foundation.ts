import { prisma } from "@/lib/prisma";

export const SYSTEM_CHARGE_CATEGORIES = [
  ["PLATFORM_FEE", "PLATFORM", "平台费用"],
  ["SHIPPING", "SHIPPING", "运输费用"],
  ["FULFILLMENT", "FULFILLMENT", "代发服务"],
  ["INSPECTION", "INSPECTION", "检查服务"],
  ["STORAGE", "STORAGE", "仓储费用"],
  ["PACKAGING", "PACKAGING", "包材费用"],
  ["AFTER_SALES", "AFTER_SALES", "退货售后"],
  ["TAX_DUTY", "TAX_DUTY", "税费关税"],
  ["COMMISSION", "COMMISSION", "佣金"],
  ["PROCUREMENT", "PROCUREMENT", "采购附加费用"],
  ["OTHER", "OTHER", "其他费用"],
] as const;

export async function ensureSystemChargeCategories() {
  for (const [code, groupCode, name] of SYSTEM_CHARGE_CATEGORIES) {
    await prisma.chargeCategory.upsert({
      where: { systemKey: code },
      update: { groupCode, name, status: "ACTIVE" },
      create: {
        organizationId: null,
        systemKey: code,
        scope: "SYSTEM",
        code,
        groupCode,
        name,
      },
    });
  }
}

export async function syncLegacyOrganizationFoundation(organizationId: string) {
  const stores = await prisma.store.findMany({
    where: { organizationId },
    include: {
      storeAccesses: true,
      platforms: true,
      locations: true,
    },
  });

  for (const store of stores) {
    const pool = await prisma.inventoryPool.upsert({
      where: { legacyStoreId: store.id },
      update: {
        organizationId,
        code: store.code,
        name: store.name,
        baseCurrency: store.currency,
      },
      create: {
        organizationId,
        legacyStoreId: store.id,
        code: store.code,
        name: store.name,
        baseCurrency: store.currency,
      },
    });

    for (const access of store.storeAccesses) {
      await prisma.inventoryPoolAccess.upsert({
        where: {
          inventoryPoolId_userId: {
            inventoryPoolId: pool.id,
            userId: access.userId,
          },
        },
        update: { role: access.role, permissions: access.permissions ?? undefined },
        create: {
          inventoryPoolId: pool.id,
          userId: access.userId,
          role: access.role,
          permissions: access.permissions ?? undefined,
        },
      });
    }

    for (const location of store.locations) {
      await prisma.location.update({
        where: { id: location.id },
        data: { operatorOrganizationId: location.operatorOrganizationId ?? organizationId },
      });
      for (const access of store.storeAccesses) {
        await prisma.locationAccess.upsert({
          where: { locationId_userId: { locationId: location.id, userId: access.userId } },
          update: { role: access.role, permissions: access.permissions ?? undefined },
          create: {
            locationId: location.id,
            userId: access.userId,
            role: access.role,
            permissions: access.permissions ?? undefined,
          },
        });
      }
    }

    for (const platform of store.platforms) {
      const channel = await prisma.salesChannelAccount.upsert({
        where: { legacyPlatformId: platform.id },
        update: {
          organizationId,
          platformCode: platform.code,
          code: `${store.code}_${platform.code}`,
          name: platform.name,
          country: platform.country,
          defaultCurrency: platform.defaultCurrency,
        },
        create: {
          organizationId,
          legacyPlatformId: platform.id,
          platformCode: platform.code,
          code: `${store.code}_${platform.code}`,
          name: platform.name,
          country: platform.country,
          defaultCurrency: platform.defaultCurrency,
          settings: {
            defaultFeeRate: platform.defaultFeeRate?.toString() ?? null,
            defaultShippingFee: platform.defaultShippingFee?.toString() ?? null,
          },
        },
      });
      for (const access of store.storeAccesses) {
        await prisma.channelAccess.upsert({
          where: {
            salesChannelAccountId_userId: {
              salesChannelAccountId: channel.id,
              userId: access.userId,
            },
          },
          update: { role: access.role, permissions: access.permissions ?? undefined },
          create: {
            salesChannelAccountId: channel.id,
            userId: access.userId,
            role: access.role,
            permissions: access.permissions ?? undefined,
          },
        });
      }

      await prisma.listing.updateMany({
        where: { platformId: platform.id, salesChannelAccountId: null },
        data: { salesChannelAccountId: channel.id },
      });
      await prisma.resaleListing.updateMany({
        where: { platformId: platform.id, salesChannelAccountId: null },
        data: { salesChannelAccountId: channel.id, sellerOrganizationId: organizationId },
      });
      await prisma.customerOrder.updateMany({
        where: { platformId: platform.id, salesChannelAccountId: null },
        data: { salesChannelAccountId: channel.id },
      });
    }

    const poolScopedUpdates = [
      prisma.sKU.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.inventoryLot.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.itemUnit.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.stockLedger.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.purchaseOrder.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.openingStock.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.inventorySplit.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.supplyOffer.updateMany({
        where: { storeId: store.id, inventoryPoolId: null },
        data: { inventoryPoolId: pool.id, providerOrganizationId: organizationId },
      }),
      prisma.inboundShipment.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.consolidationBatch.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.inspectionEvent.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
      prisma.quickEntry.updateMany({ where: { storeId: store.id, inventoryPoolId: null }, data: { inventoryPoolId: pool.id } }),
    ];
    await Promise.all(poolScopedUpdates);
  }

  await ensureSystemChargeCategories();
  return { stores: stores.length };
}

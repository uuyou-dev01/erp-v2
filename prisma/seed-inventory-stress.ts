import { PrismaClient } from "@prisma/client";
import { createPublicCode } from "../lib/auth/invitation-token";

const prisma = new PrismaClient();

const STORE_ID = "store_1";
const STRESS_PREFIX = "STRESS-";
const GROUP_PREFIX = `${STRESS_PREFIX}GROUP-`;
const SKU_PREFIX = `${STRESS_PREFIX}SKU-`;
const ITEM_PREFIX = `${STRESS_PREFIX}IU-`;
const BASE_DATE = new Date("2026-07-07T00:00:00.000Z");

const platformSeeds = [
  {
    code: "MERCARI",
    name: "Mercari",
    country: "JP",
    defaultFeeRate: "0.1000",
    defaultCurrency: "JPY",
  },
  {
    code: "YAHOO_AUCTION",
    name: "Yahoo拍卖",
    country: "JP",
    defaultFeeRate: "0.0880",
    defaultCurrency: "JPY",
  },
  {
    code: "SNKRDUNK",
    name: "SNKRDUNK",
    country: "JP",
    defaultFeeRate: "0.0990",
    defaultCurrency: "JPY",
  },
  {
    code: "XIAN_YU",
    name: "闲鱼",
    country: "CN",
    defaultFeeRate: "0.0000",
    defaultCurrency: "CNY",
  },
  {
    code: "DOUYIN",
    name: "抖音小店",
    country: "CN",
    defaultFeeRate: "0.0200",
    defaultCurrency: "CNY",
  },
  {
    code: "XIAOHONGSHU",
    name: "小红书",
    country: "CN",
    defaultFeeRate: "0.0300",
    defaultCurrency: "CNY",
  },
  {
    code: "TAOBAO",
    name: "淘宝",
    country: "CN",
    defaultFeeRate: "0.0060",
    defaultCurrency: "CNY",
  },
] as const;

const locationSeeds = [
  {
    code: "STRESS-WH-CN-A",
    name: "上海A仓",
    region: "CN_SHANGHAI",
    type: "WAREHOUSE",
    isSellableDefault: true,
  },
  {
    code: "STRESS-WH-CN-B",
    name: "义乌B仓",
    region: "CN_ZHEJIANG",
    type: "WAREHOUSE",
    isSellableDefault: true,
  },
  {
    code: "STRESS-FWD-CN",
    name: "中国转运仓",
    region: "CN_GUANGDONG",
    type: "FORWARDER",
    isSellableDefault: false,
  },
  {
    code: "STRESS-WH-JP-A",
    name: "东京A仓",
    region: "JP_TOKYO",
    type: "WAREHOUSE",
    isSellableDefault: true,
  },
  {
    code: "STRESS-WH-JP-B",
    name: "大阪B仓",
    region: "JP_OSAKA",
    type: "WAREHOUSE",
    isSellableDefault: true,
  },
  {
    code: "STRESS-FWD-JP",
    name: "日本转运仓",
    region: "JP_KANSAI",
    type: "FORWARDER",
    isSellableDefault: false,
  },
] as const;

const catalogSeeds = [
  {
    category: "球鞋",
    brand: "Nike",
    series: "Air Jordan 1",
    axis: "尺码",
    variants: ["40码", "41码", "42码", "43码"],
  },
  {
    category: "球鞋",
    brand: "Adidas",
    series: "Samba OG",
    axis: "尺码",
    variants: ["37码", "38码", "39码", "40码"],
  },
  {
    category: "手办",
    brand: "Bandai",
    series: "一番赏角色",
    axis: "款式",
    variants: ["A赏", "B赏", "C赏", "隐藏款"],
  },
  {
    category: "潮玩",
    brand: "Medicom Toy",
    series: "BE@RBRICK",
    axis: "规格",
    variants: ["100%", "400%", "1000%"],
  },
  {
    category: "服装",
    brand: "Uniqlo",
    series: "联名T恤",
    axis: "尺码",
    variants: ["S", "M", "L", "XL"],
  },
  {
    category: "卡牌",
    brand: "Pokemon",
    series: "收藏卡包",
    axis: "版本",
    variants: ["日版", "港版", "国行"],
  },
  {
    category: "游戏",
    brand: "Nintendo",
    series: "Switch配件",
    axis: "颜色",
    variants: ["红蓝", "白色", "黑色"],
  },
  {
    category: "家居",
    brand: "Muji",
    series: "收纳用品",
    axis: "尺寸",
    variants: ["小号", "中号", "大号"],
  },
  {
    category: "数码",
    brand: "Sony",
    series: "音频配件",
    axis: "颜色",
    variants: ["黑色", "银色", "蓝色"],
  },
  {
    category: "潮牌",
    brand: "Supreme",
    series: "季度配件",
    axis: "款式",
    variants: ["红标", "黑标", "限定"],
  },
] as const;

function pad(value: number) {
  return String(value).padStart(3, "0");
}

function daysAgo(days: number) {
  const next = new Date(BASE_DATE);
  next.setDate(next.getDate() - days);
  return next;
}

function pick<T>(items: readonly T[], index: number) {
  return items[index % items.length];
}

function catalogAttrs(input: {
  productKind: "NEW" | "USED";
  referencePrice?: string | null;
  referenceCost?: string | null;
  currency: "CNY" | "JPY";
  series: string;
  status?: "active" | "disabled";
  tags?: string[];
}) {
  return {
    catalogStatus: input.status ?? "active",
    productKind: input.productKind,
    referencePrice: input.referencePrice,
    referenceCost: input.referenceCost,
    currency: input.currency,
    series: input.series,
    tags: input.tags ?? [],
  };
}

function imageUrl(text: string) {
  return `https://placehold.co/600x600/f8fafc/334155?text=${encodeURIComponent(text)}`;
}

async function ensureBaseStore() {
  const organization = await prisma.organization.upsert({
    where: { code: "main" },
    update: { name: "默认经营主体" },
    create: {
      code: "main",
      name: "默认经营主体",
      collaborationCode: createPublicCode("ORG"),
    },
  });

  if (!/^ORG-[23456789A-HJ-NP-Z]{6,12}$/.test(organization.collaborationCode)) {
    await prisma.organization.update({
      where: { id: organization.id },
      data: { collaborationCode: createPublicCode("ORG") },
    });
  }

  return prisma.store.upsert({
    where: { id: STORE_ID },
    update: {
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
      organizationId: organization.id,
    },
    create: {
      id: STORE_ID,
      organizationId: organization.id,
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
    },
  });
}

async function ensurePlatforms(storeId: string) {
  const entries = await Promise.all(
    platformSeeds.map((platform) =>
      prisma.platform.upsert({
        where: { storeId_code: { storeId, code: platform.code } },
        update: {
          name: platform.name,
          country: platform.country,
          defaultFeeRate: platform.defaultFeeRate,
          defaultCurrency: platform.defaultCurrency,
        },
        create: {
          storeId,
          code: platform.code,
          name: platform.name,
          country: platform.country,
          defaultFeeRate: platform.defaultFeeRate,
          defaultCurrency: platform.defaultCurrency,
        },
      })
    )
  );

  return new Map(entries.map((platform) => [platform.code, platform]));
}

async function ensureLocations(storeId: string) {
  const entries = await Promise.all(
    locationSeeds.map((location) =>
      prisma.location.upsert({
        where: { storeId_code: { storeId, code: location.code } },
        update: {
          name: location.name,
          region: location.region,
          type: location.type,
          isSellableDefault: location.isSellableDefault,
        },
        create: {
          storeId,
          code: location.code,
          name: location.name,
          region: location.region,
          type: location.type,
          isSellableDefault: location.isSellableDefault,
        },
      })
    )
  );

  return new Map(entries.map((location) => [location.code, location]));
}

async function cleanupStressData(storeId: string) {
  const stressSkus = await prisma.sKU.findMany({
    where: { storeId, code: { startsWith: STRESS_PREFIX } },
    select: { id: true },
  });
  const skuIds = stressSkus.map((sku) => sku.id);
  if (skuIds.length === 0) return;

  const [itemUnits, lots] = await Promise.all([
    prisma.itemUnit.findMany({ where: { storeId, skuId: { in: skuIds } }, select: { id: true } }),
    prisma.inventoryLot.findMany({
      where: { storeId, skuId: { in: skuIds } },
      select: { id: true },
    }),
  ]);
  const itemUnitIds = itemUnits.map((item) => item.id);
  const lotIds = lots.map((lot) => lot.id);

  await prisma.listing.deleteMany({
    where: {
      storeId,
      OR: [
        { skuId: { in: skuIds } },
        ...(itemUnitIds.length > 0 ? [{ itemUnitId: { in: itemUnitIds } }] : []),
      ],
    },
  });

  const ledgerOr = [
    ...(lotIds.length > 0 ? [{ entityType: "LOT", entityId: { in: lotIds } }] : []),
    ...(itemUnitIds.length > 0 ? [{ entityType: "ITEM_UNIT", entityId: { in: itemUnitIds } }] : []),
    { refId: { startsWith: STRESS_PREFIX } },
  ];
  await prisma.stockLedger.deleteMany({ where: { storeId, OR: ledgerOr } });
  await prisma.inventoryLot.deleteMany({ where: { storeId, id: { in: lotIds } } });
  await prisma.itemUnit.deleteMany({ where: { storeId, id: { in: itemUnitIds } } });
  await prisma.sKU.deleteMany({ where: { storeId, code: { startsWith: STRESS_PREFIX } } });
}

async function createLot(input: {
  storeId: string;
  skuId: string;
  locationId: string;
  quantity: number;
  unitCost: string;
  currency: "CNY" | "JPY";
  sourceId: string;
  batchLabel: string;
  receivedAt: Date;
}) {
  const lot = await prisma.inventoryLot.create({
    data: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: input.unitCost,
      costCurrency: input.currency,
      sourceType: "QUICK_ENTRY",
      sourceId: input.sourceId,
      receivedAt: input.receivedAt,
      batchLabel: input.batchLabel,
      status: "ACTIVE",
    },
  });

  await prisma.stockLedger.create({
    data: {
      storeId: input.storeId,
      occurredAt: input.receivedAt,
      entityType: "LOT",
      entityId: lot.id,
      locationId: input.locationId,
      deltaQty: String(input.quantity),
      reason: "INBOUND_PURCHASE",
      refType: "STRESS_SEED",
      refId: input.sourceId,
      meta: { batchLabel: input.batchLabel },
    },
  });

  return lot;
}

async function createItemUnit(input: {
  storeId: string;
  skuId: string;
  locationId: string;
  unitCost: string;
  currency: "CNY" | "JPY";
  unitCode: string;
  conditionGrade: string;
  photos: string[];
  sourceId: string;
  receivedAt: Date;
}) {
  const item = await prisma.itemUnit.create({
    data: {
      storeId: input.storeId,
      skuId: input.skuId,
      locationId: input.locationId,
      unitCost: input.unitCost,
      costCurrency: input.currency,
      unitCode: input.unitCode,
      labelCode: input.unitCode,
      labelStatus: input.photos.length > 0 ? "ATTACHED" : "PENDING",
      conditionGrade: input.conditionGrade,
      photos: input.photos,
      notes: "压力测试中古单件，覆盖照片、标签、品相和仓位差异。",
      sourceType: "QUICK_ENTRY",
      sourceId: input.sourceId,
      status: "AVAILABLE",
    },
  });

  await prisma.stockLedger.create({
    data: {
      storeId: input.storeId,
      occurredAt: input.receivedAt,
      entityType: "ITEM_UNIT",
      entityId: item.id,
      locationId: input.locationId,
      deltaQty: "1",
      reason: "INBOUND_PURCHASE",
      refType: "STRESS_SEED",
      refId: input.sourceId,
      meta: { unitCode: input.unitCode },
    },
  });

  return item;
}

function lotQuantity(index: number) {
  const pattern = index % 6;
  if (pattern === 0) return 1;
  if (pattern === 1) return 2;
  if (pattern === 2) return 5;
  if (pattern === 3) return 12;
  if (pattern === 4) return 0;
  return 8;
}

async function seedStressInventory(
  storeId: string,
  platformsByCode: Awaited<ReturnType<typeof ensurePlatforms>>,
  locationsByCode: Awaited<ReturnType<typeof ensureLocations>>
) {
  let variantCountTotal = 0;
  let lotCount = 0;
  let itemUnitCount = 0;
  let listingCount = 0;

  for (let groupIndex = 1; groupIndex <= 100; groupIndex += 1) {
    const market = groupIndex % 2 === 0 ? "JP" : "CN";
    const currency = market === "JP" ? "JPY" : "CNY";
    const catalog = pick(catalogSeeds, groupIndex - 1);
    const groupNo = pad(groupIndex);
    const productKind = groupIndex % 4 === 0 ? "USED" : "NEW";
    const variantTotal = 1 + (groupIndex % Math.min(4, catalog.variants.length));
    const referencePrice =
      groupIndex % 11 === 0
        ? null
        : String(currency === "JPY" ? 1800 + groupIndex * 420 : 80 + groupIndex * 16);
    const referenceCost =
      referencePrice === null
        ? null
        : String(Math.round(Number(referencePrice) * (currency === "JPY" ? 0.58 : 0.52)));
    const hasImage = groupIndex % 7 !== 0;
    const category = groupIndex % 13 === 0 ? null : catalog.category;
    const brand = groupIndex % 17 === 0 ? null : catalog.brand;
    const status = groupIndex % 19 === 0 ? "disabled" : "active";
    const groupCode = `${GROUP_PREFIX}${groupNo}`;
    const groupName = `${catalog.brand} ${catalog.series} ${groupNo}`;

    const parent = await prisma.sKU.create({
      data: {
        storeId,
        code: groupCode,
        name: groupName,
        catalogRole: "GROUP",
        manufacturerCode: `${STRESS_PREFIX}MODEL-${groupNo}`,
        variantAxes: [catalog.axis],
        nameSource: "MANUAL",
        codeSource: "AUTO",
        category,
        brand,
        imageUrl: hasImage ? imageUrl(`${catalog.brand}-${groupNo}`) : null,
        attributes: catalogAttrs({
          productKind,
          referencePrice,
          referenceCost,
          currency,
          series: catalog.series,
          status,
          tags: ["压力测试", market, catalog.category],
        }),
      },
    });

    const targetPlatformCodes =
      market === "JP"
        ? ["MERCARI", "YAHOO_AUCTION", "SNKRDUNK"]
        : ["XIAN_YU", "DOUYIN", "XIAOHONGSHU", "TAOBAO"];
    const sellableLocationCodes =
      market === "JP" ? ["STRESS-WH-JP-A", "STRESS-WH-JP-B"] : ["STRESS-WH-CN-A", "STRESS-WH-CN-B"];
    const transitLocationCode = market === "JP" ? "STRESS-FWD-JP" : "STRESS-FWD-CN";
    const platformTargets = targetPlatformCodes.map((code) => platformsByCode.get(code)!);
    const sellableLocations = sellableLocationCodes.map((code) => locationsByCode.get(code)!);
    const transitLocation = locationsByCode.get(transitLocationCode)!;

    for (let variantIndex = 0; variantIndex < variantTotal; variantIndex += 1) {
      const variantLabel = catalog.variants[variantIndex];
      const variantNo = `${groupNo}-${variantIndex + 1}`;
      const variantCode = `${SKU_PREFIX}${variantNo}`;
      const variantName = `${groupName} · ${variantLabel}`;
      const variantPrice =
        referencePrice === null
          ? null
          : String(Number(referencePrice) + variantIndex * (currency === "JPY" ? 300 : 12));
      const variantCost =
        referenceCost === null
          ? null
          : String(Number(referenceCost) + variantIndex * (currency === "JPY" ? 180 : 6));

      const variant = await prisma.sKU.create({
        data: {
          storeId,
          parentSkuId: parent.id,
          code: variantCode,
          name: variantName,
          catalogRole: "VARIANT",
          variantLabel,
          variantValues: { [catalog.axis]: variantLabel },
          nameSource: "AUTO",
          codeSource: "AUTO",
          category,
          brand,
          imageUrl:
            hasImage && variantIndex === 0 ? imageUrl(`${catalog.brand}-${variantNo}`) : null,
          attributes: {
            ...catalogAttrs({
              productKind,
              referencePrice: variantPrice,
              referenceCost: variantCost,
              currency,
              series: catalog.series,
              status,
              tags: ["压力测试", market, catalog.category, variantLabel],
            }),
            [catalog.axis]: variantLabel,
          },
        },
      });
      variantCountTotal += 1;

      const sourceId = `${STRESS_PREFIX}SEED-${variantNo}`;
      let sellableQty =
        productKind === "USED" && variantIndex === 0 ? 0 : lotQuantity(groupIndex + variantIndex);
      if (groupIndex % 10 === 0 && variantIndex === 0) sellableQty = 1;
      const receivedAt = daysAgo((groupIndex + variantIndex) % 45);

      if (sellableQty > 0) {
        const primaryLocation =
          sellableLocations[(groupIndex + variantIndex) % sellableLocations.length];
        const splitAcrossWarehouses = sellableQty >= 5 && (groupIndex + variantIndex) % 4 === 0;
        if (splitAcrossWarehouses) {
          const secondaryQty = Math.max(1, Math.floor(sellableQty / 3));
          await createLot({
            storeId,
            skuId: variant.id,
            locationId: primaryLocation.id,
            quantity: sellableQty - secondaryQty,
            unitCost: variantCost ?? (currency === "JPY" ? "1200" : "60"),
            currency,
            sourceId,
            batchLabel: `${STRESS_PREFIX}LOT-${variantNo}-A`,
            receivedAt,
          });
          await createLot({
            storeId,
            skuId: variant.id,
            locationId: sellableLocations.find((loc) => loc.id !== primaryLocation.id)!.id,
            quantity: secondaryQty,
            unitCost: variantCost ?? (currency === "JPY" ? "1200" : "60"),
            currency,
            sourceId,
            batchLabel: `${STRESS_PREFIX}LOT-${variantNo}-B`,
            receivedAt,
          });
          lotCount += 2;
        } else {
          await createLot({
            storeId,
            skuId: variant.id,
            locationId: primaryLocation.id,
            quantity: sellableQty,
            unitCost: variantCost ?? (currency === "JPY" ? "1200" : "60"),
            currency,
            sourceId,
            batchLabel: `${STRESS_PREFIX}LOT-${variantNo}`,
            receivedAt,
          });
          lotCount += 1;
        }
      }

      if ((groupIndex + variantIndex) % 3 === 0) {
        await createLot({
          storeId,
          skuId: variant.id,
          locationId: transitLocation.id,
          quantity: 1 + ((groupIndex + variantIndex) % 5),
          unitCost: variantCost ?? (currency === "JPY" ? "1200" : "60"),
          currency,
          sourceId: `${sourceId}-TRANSIT`,
          batchLabel: `${STRESS_PREFIX}TRANSIT-${variantNo}`,
          receivedAt: daysAgo((groupIndex + variantIndex) % 20),
        });
        lotCount += 1;
      }

      const usedUnitTotal =
        productKind === "USED"
          ? 1 + ((groupIndex + variantIndex) % 2)
          : groupIndex % 9 === 0 && variantIndex === 0
            ? 1
            : 0;
      const createdUnits = [];
      for (let unitIndex = 0; unitIndex < usedUnitTotal; unitIndex += 1) {
        const inTransit = (groupIndex + unitIndex) % 8 === 0;
        const unitLocation = inTransit
          ? transitLocation
          : sellableLocations[(groupIndex + unitIndex) % sellableLocations.length];
        const unit = await createItemUnit({
          storeId,
          skuId: variant.id,
          locationId: unitLocation.id,
          unitCost: variantCost ?? (currency === "JPY" ? "1600" : "80"),
          currency,
          unitCode: `${ITEM_PREFIX}${variantNo}-${unitIndex + 1}`,
          conditionGrade: pick(["S", "A", "B", "C"], groupIndex + unitIndex),
          photos:
            (groupIndex + unitIndex) % 5 === 0
              ? []
              : [imageUrl(`${catalog.brand}-${variantNo}-USED-${unitIndex + 1}`)],
          sourceId: `${sourceId}-UNIT-${unitIndex + 1}`,
          receivedAt,
        });
        itemUnitCount += 1;
        createdUnits.push({ item: unit, inTransit });
      }

      const listingMode = (groupIndex + variantIndex) % 5;
      const skuListingTargetCount =
        sellableQty <= 0
          ? 0
          : listingMode === 0
            ? 0
            : Math.min(platformTargets.length, listingMode);
      for (let platformIndex = 0; platformIndex < skuListingTargetCount; platformIndex += 1) {
        const platform = platformTargets[platformIndex];
        await prisma.listing.create({
          data: {
            storeId,
            platformId: platform.id,
            skuId: variant.id,
            listingType: "SKU",
            listedPrice: variantPrice ?? (currency === "JPY" ? "1980" : "99"),
            currency,
            status:
              platformIndex === skuListingTargetCount - 1 && (groupIndex + variantIndex) % 12 === 0
                ? "SOLD_OUT"
                : "ACTIVE",
            listedAt: daysAgo((groupIndex + variantIndex + platformIndex) % 30),
          },
        });
        listingCount += 1;
      }

      for (let unitIndex = 0; unitIndex < createdUnits.length; unitIndex += 1) {
        const unit = createdUnits[unitIndex];
        if (unit.inTransit || (groupIndex + unitIndex) % 3 !== 0) continue;
        await prisma.listing.create({
          data: {
            storeId,
            platformId: platformTargets[0].id,
            itemUnitId: unit.item.id,
            listingType: "ITEM_UNIT",
            listedPrice: variantPrice ?? (currency === "JPY" ? "2280" : "128"),
            currency,
            status: "ACTIVE",
            listedAt: daysAgo((groupIndex + unitIndex) % 21),
          },
        });
        listingCount += 1;
      }
    }
  }

  return {
    groups: 100,
    variants: variantCountTotal,
    lots: lotCount,
    itemUnits: itemUnitCount,
    listings: listingCount,
  };
}

async function main() {
  console.log("开始生成库存压力数据...");
  const store = await ensureBaseStore();
  const [platformsByCode, locationsByCode] = await Promise.all([
    ensurePlatforms(store.id),
    ensureLocations(store.id),
  ]);

  await cleanupStressData(store.id);
  const result = await seedStressInventory(store.id, platformsByCode, locationsByCode);
  const [groupCount, variantCount, listingCount] = await Promise.all([
    prisma.sKU.count({ where: { storeId: store.id, code: { startsWith: GROUP_PREFIX } } }),
    prisma.sKU.count({ where: { storeId: store.id, code: { startsWith: SKU_PREFIX } } }),
    prisma.listing.count({
      where: {
        storeId: store.id,
        OR: [
          { sku: { code: { startsWith: SKU_PREFIX } } },
          { itemUnit: { sku: { code: { startsWith: SKU_PREFIX } } } },
        ],
      },
    }),
  ]);

  console.log("库存压力数据生成完成");
  console.log(`  商品组: ${groupCount}`);
  console.log(`  规格SKU: ${variantCount}`);
  console.log(`  批次/单件/上架: ${result.lots}/${result.itemUnits}/${listingCount}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

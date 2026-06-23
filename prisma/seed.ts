import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("开始初始化数据...");

  const organization = await prisma.organization.upsert({
    where: { code: "main" },
    update: { name: "默认经营主体" },
    create: {
      name: "默认经营主体",
      code: "main",
    },
  });

  // Create default store
  const store = await prisma.store.upsert({
    where: { id: "store_1" },
    update: {
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
      organizationId: organization.id,
    },
    create: {
      id: "store_1",
      organizationId: organization.id,
      name: "默认店铺",
      code: "STORE_1",
      currency: "CNY",
    },
  });

  // Create default user
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {
      role: "OWNER",
      storeId: store.id,
    },
    create: {
      email: "admin@example.com",
      name: "管理员",
      password: "hashed_password_placeholder",
      role: "OWNER",
      storeId: store.id,
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: adminUser.id,
      },
    },
    update: { role: "OWNER", status: "ACTIVE" },
    create: {
      organizationId: organization.id,
      userId: adminUser.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  await prisma.storeAccess.upsert({
    where: {
      storeId_userId: {
        storeId: store.id,
        userId: adminUser.id,
      },
    },
    update: { role: "OWNER" },
    create: {
      storeId: store.id,
      userId: adminUser.id,
      role: "OWNER",
    },
  });

  // Create default platforms for the current Japan + China resale flow.
  const platforms = [
    {
      code: "MERCARI",
      name: "Mercari（メルカリ）",
      country: "JP",
      defaultFeeRate: 0.1,
      defaultCurrency: "JPY",
    },
    {
      code: "YAHOO_AUCTION",
      name: "Yahoo拍卖（ヤフオク）",
      country: "JP",
      defaultFeeRate: 0.088,
      defaultCurrency: "JPY",
    },
    {
      code: "SNKRDUNK",
      name: "SNKRDUNK",
      country: "JP",
      defaultFeeRate: 0.099,
      defaultCurrency: "JPY",
    },
    {
      code: "XIAN_YU",
      name: "闲鱼（Xianyu）",
      country: "CN",
      defaultFeeRate: 0,
      defaultCurrency: "CNY",
    },
  ];

  for (const p of platforms) {
    await prisma.platform.upsert({
      where: { storeId_code: { storeId: store.id, code: p.code } },
      update: {
        name: p.name,
        country: p.country,
        defaultFeeRate: p.defaultFeeRate,
        defaultCurrency: p.defaultCurrency,
      },
      create: {
        storeId: store.id,
        code: p.code,
        name: p.name,
        country: p.country,
        defaultFeeRate: p.defaultFeeRate,
        defaultCurrency: p.defaultCurrency,
      },
    });
  }

  // Create default locations
  const locations = [
    {
      code: "WH-CN-01",
      name: "中国主仓",
      type: "WAREHOUSE",
      region: "CN_SHANGHAI",
    },
    {
      code: "WH-JP-01",
      name: "日本仓库",
      type: "WAREHOUSE",
      region: "JP_TOKYO",
    },
    {
      code: "FWD-01",
      name: "集运仓",
      type: "FORWARDER",
      region: "JP_OSAKA",
    },
  ];

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { storeId_code: { storeId: store.id, code: loc.code } },
      update: { name: loc.name, type: loc.type, region: loc.region },
      create: {
        storeId: store.id,
        code: loc.code,
        name: loc.name,
        type: loc.type,
        region: loc.region,
      },
    });
  }

  // Create default FX rates
  const fxRates = [
    { fromCurrency: "CNY", toCurrency: "JPY", rate: 20.5 },
    { fromCurrency: "JPY", toCurrency: "CNY", rate: 0.0488 },
    { fromCurrency: "USD", toCurrency: "CNY", rate: 7.25 },
    { fromCurrency: "USD", toCurrency: "JPY", rate: 148.5 },
  ];

  for (const fx of fxRates) {
    await prisma.fxRate.create({
      data: {
        fromCurrency: fx.fromCurrency,
        toCurrency: fx.toCurrency,
        rate: fx.rate,
        effectiveDate: new Date(),
      },
    });
  }

  console.log("数据初始化完成！");
  console.log(`  店铺: ${store.name}`);
  console.log(`  平台: ${platforms.length} 个`);
  console.log(`  仓库: ${locations.length} 个`);
  console.log(`  汇率: ${fxRates.length} 条`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

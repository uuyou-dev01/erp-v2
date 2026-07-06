import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const storeId = "store_1";

  // --- 1. Nike Air Max 90 → add size variants ---
  const shoe = await prisma.sKU.findFirst({
    where: { storeId, code: "SHOE-001" },
  });

  if (shoe) {
    const shoeChildren = [
      { code: "SHOE-001-US8", name: "Nike Air Max 90 · US 8", attrs: { 尺寸: "US 8", 颜色: "White/Black" } },
      { code: "SHOE-001-US9", name: "Nike Air Max 90 · US 9", attrs: { 尺寸: "US 9", 颜色: "White/Black" } },
      { code: "SHOE-001-US10", name: "Nike Air Max 90 · US 10", attrs: { 尺寸: "US 10", 颜色: "White/Black" } },
      { code: "SHOE-001-US11", name: "Nike Air Max 90 · US 11", attrs: { 尺寸: "US 11", 颜色: "Black/Red" } },
    ];

    for (const child of shoeChildren) {
      await prisma.sKU.upsert({
        where: { storeId_code: { storeId, code: child.code } },
        update: { parentSkuId: shoe.id },
        create: {
          storeId,
          code: child.code,
          name: child.name,
          parentSkuId: shoe.id,
          category: shoe.category,
          brand: shoe.brand,
          attributes: child.attrs,
        },
      });
    }
    console.log(`✓ Nike Air Max 90: 创建 ${shoeChildren.length} 个尺码规格 SKU`);
  }

  // --- 2. Pokemon Booster Box → add variant packs ---
  const pokemon = await prisma.sKU.findFirst({
    where: { storeId, code: "TOY-001" },
  });

  if (pokemon) {
    const pokemonChildren = [
      { code: "TOY-001-SV", name: "Pokemon Booster · Scarlet & Violet", attrs: { set: "Scarlet & Violet", language: "Japanese" } },
      { code: "TOY-001-PAF", name: "Pokemon Booster · Paldea Evolved", attrs: { set: "Paldea Evolved", language: "Japanese" } },
      { code: "TOY-001-OBF", name: "Pokemon Booster · Obsidian Flames", attrs: { set: "Obsidian Flames", language: "English" } },
    ];

    for (const child of pokemonChildren) {
      await prisma.sKU.upsert({
        where: { storeId_code: { storeId, code: child.code } },
        update: { parentSkuId: pokemon.id },
        create: {
          storeId,
          code: child.code,
          name: child.name,
          parentSkuId: pokemon.id,
          category: pokemon.category,
          brand: pokemon.brand,
          attributes: child.attrs,
        },
      });
    }
    console.log(`✓ Pokemon Booster Box: 创建 ${pokemonChildren.length} 个系列规格 SKU`);
  }

  // --- 3. Create a brand new blind-box parent + children ---
  const blindBox = await prisma.sKU.upsert({
    where: { storeId_code: { storeId, code: "BOX-001" } },
    update: {},
    create: {
      storeId,
      code: "BOX-001",
      name: "泡泡玛特 MOLLY 星际旅行系列 盲盒整端",
      category: "盲盒",
      brand: "Pop Mart",
      attributes: { 系列: "星际旅行", 每端数量: "12" },
    },
  });

  const mollyChildren = [
    { code: "BOX-001-01", name: "MOLLY 星际旅行 · 宇航员", attrs: { 款式: "宇航员" } },
    { code: "BOX-001-02", name: "MOLLY 星际旅行 · 飞行员", attrs: { 款式: "飞行员" } },
    { code: "BOX-001-03", name: "MOLLY 星际旅行 · 探险家", attrs: { 款式: "探险家" } },
    { code: "BOX-001-04", name: "MOLLY 星际旅行 · 机械师", attrs: { 款式: "机械师" } },
    { code: "BOX-001-05", name: "MOLLY 星际旅行 · 通讯员", attrs: { 款式: "通讯员" } },
    { code: "BOX-001-SS", name: "MOLLY 星际旅行 · 隐藏款 银河女王", attrs: { 款式: "隐藏款 银河女王" } },
  ];

  for (const child of mollyChildren) {
    await prisma.sKU.upsert({
      where: { storeId_code: { storeId, code: child.code } },
      update: { parentSkuId: blindBox.id },
      create: {
        storeId,
        code: child.code,
        name: child.name,
        parentSkuId: blindBox.id,
        category: "盲盒",
        brand: "Pop Mart",
        attributes: child.attrs,
      },
    });
  }
  console.log(`✓ MOLLY 盲盒: 创建商品组 + ${mollyChildren.length} 个角色规格 SKU`);

  // --- 4. Create a T-shirt parent + size children ---
  const tshirt = await prisma.sKU.upsert({
    where: { storeId_code: { storeId, code: "APP-001" } },
    update: {},
    create: {
      storeId,
      code: "APP-001",
      name: "UNIQLO U 圆领T恤",
      category: "服装",
      brand: "UNIQLO",
      attributes: { 材质: "100% 棉", 风格: "基础款" },
    },
  });

  const tshirtChildren = [
    { code: "APP-001-WH-S", name: "UNIQLO U 圆领T恤 · 白色 S", attrs: { 颜色: "白色", 尺寸: "S" } },
    { code: "APP-001-WH-M", name: "UNIQLO U 圆领T恤 · 白色 M", attrs: { 颜色: "白色", 尺寸: "M" } },
    { code: "APP-001-WH-L", name: "UNIQLO U 圆领T恤 · 白色 L", attrs: { 颜色: "白色", 尺寸: "L" } },
    { code: "APP-001-BK-S", name: "UNIQLO U 圆领T恤 · 黑色 S", attrs: { 颜色: "黑色", 尺寸: "S" } },
    { code: "APP-001-BK-M", name: "UNIQLO U 圆领T恤 · 黑色 M", attrs: { 颜色: "黑色", 尺寸: "M" } },
    { code: "APP-001-BK-L", name: "UNIQLO U 圆领T恤 · 黑色 L", attrs: { 颜色: "黑色", 尺寸: "L" } },
  ];

  for (const child of tshirtChildren) {
    await prisma.sKU.upsert({
      where: { storeId_code: { storeId, code: child.code } },
      update: { parentSkuId: tshirt.id },
      create: {
        storeId,
        code: child.code,
        name: child.name,
        parentSkuId: tshirt.id,
        category: "服装",
        brand: "UNIQLO",
        attributes: child.attrs,
      },
    });
  }
  console.log(`✓ UNIQLO T恤: 创建商品组 + ${tshirtChildren.length} 个颜色×尺码规格 SKU`);

  console.log("\n假数据创建完成！刷新 SKU 列表页面查看折叠效果。");
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

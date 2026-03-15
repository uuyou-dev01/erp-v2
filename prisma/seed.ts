import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create a default store
  const store = await prisma.store.upsert({
    where: { id: 'store_1' },
    update: {},
    create: {
      id: 'store_1',
      name: 'Default Store',
      code: 'STORE_001',
    },
  });

  console.log('✅ Created store:', store.name);

  // Create sample locations
  const locations = await Promise.all([
    prisma.location.upsert({
      where: { id: 'loc_warehouse_1' },
      update: {},
      create: {
        id: 'loc_warehouse_1',
        storeId: store.id,
        code: 'WH_MAIN',
        name: 'Main Warehouse',
        type: 'WAREHOUSE',
        isSellableDefault: true,
      },
    }),
    prisma.location.upsert({
      where: { id: 'loc_forwarder_1' },
      update: {},
      create: {
        id: 'loc_forwarder_1',
        storeId: store.id,
        code: 'FWD_CN',
        name: 'China Forwarder',
        type: 'FORWARDER',
        isSellableDefault: false,
      },
    }),
    prisma.location.upsert({
      where: { id: 'loc_warehouse_2' },
      update: {},
      create: {
        id: 'loc_warehouse_2',
        storeId: store.id,
        code: 'WH_JP',
        name: 'Japan Warehouse',
        type: 'WAREHOUSE',
        isSellableDefault: true,
      },
    }),
  ]);

  console.log(`✅ Created ${locations.length} locations`);

  // Create sample SKUs
  const skus = await Promise.all([
    prisma.sKU.upsert({
      where: { id: 'sku_1' },
      update: {},
      create: {
        id: 'sku_1',
        storeId: store.id,
        code: 'SHOE-001',
        name: 'Nike Air Max 90',
        category: 'Footwear',
        brand: 'Nike',
        attributes: {
          size: 'US 10',
          color: 'White/Black',
          condition: 'New',
        },
      },
    }),
    prisma.sKU.upsert({
      where: { id: 'sku_2' },
      update: {},
      create: {
        id: 'sku_2',
        storeId: store.id,
        code: 'ELEC-001',
        name: 'iPhone 15 Pro',
        category: 'Electronics',
        brand: 'Apple',
        attributes: {
          storage: '256GB',
          color: 'Titanium Blue',
        },
      },
    }),
    prisma.sKU.upsert({
      where: { id: 'sku_3' },
      update: {},
      create: {
        id: 'sku_3',
        storeId: store.id,
        code: 'TOY-001',
        name: 'Pokemon Booster Box',
        category: 'Collectibles',
        brand: 'Pokemon',
        attributes: {
          set: 'Scarlet & Violet',
          language: 'Japanese',
        },
      },
    }),
  ]);

  console.log(`✅ Created ${skus.length} SKUs`);

  console.log('🎉 Database seed completed successfully!');
  console.log('\nYou can now:');
  console.log('1. Run: npm run dev');
  console.log('2. Visit: http://localhost:3000');
  console.log('3. Or view data: npx prisma studio');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

# Database Setup Guide

## Prerequisites

You need PostgreSQL installed on your local machine.

### Install PostgreSQL (macOS)

```bash
# Using Homebrew
brew install postgresql@15

# Start PostgreSQL service
brew services start postgresql@15

# Or start manually
pg_ctl -D /opt/homebrew/var/postgresql@15 start
```

### Verify PostgreSQL Installation

```bash
# Check if PostgreSQL is running
psql --version

# Should output something like: psql (PostgreSQL) 15.x
```

## Step 1: Create Database

```bash
# Connect to PostgreSQL (default user is your macOS username)
psql postgres

# Inside psql, create the database
CREATE DATABASE erp_v2;

# Create a user (optional, or use your default user)
CREATE USER erp_user WITH PASSWORD 'your_password';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE erp_v2 TO erp_user;

# Exit psql
\q
```

## Step 2: Configure Environment Variables

Create a `.env` file in your project root (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and update the `DATABASE_URL`:

### Option A: Using default PostgreSQL user (your macOS username)
```env
DATABASE_URL="postgresql://localhost:5432/erp_v2?schema=public"
```

### Option B: Using custom user
```env
DATABASE_URL="postgresql://erp_user:your_password@localhost:5432/erp_v2?schema=public"
```

## Step 3: Run Prisma Migrations

Now that your database is set up, run the Prisma migrations to create all tables:

```bash
# Generate Prisma Client
npx prisma generate

# Create and run migrations
npx prisma migrate dev --name init

# This will:
# 1. Create a new migration file
# 2. Apply the migration to your database
# 3. Generate the Prisma Client
```

## Step 4: Verify Database Setup

```bash
# Open Prisma Studio to view your database
npx prisma studio

# This will open http://localhost:5555 in your browser
# You should see all your tables (empty for now)
```

## Step 5: Seed Initial Data (Optional)

Create a seed script to add initial data:

```bash
# Create seed file
touch prisma/seed.ts
```

Add this content to `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Create a default store
  const store = await prisma.store.create({
    data: {
      name: 'Default Store',
      code: 'STORE_001',
    },
  });

  console.log('Created store:', store);

  // Create some sample locations
  const warehouse = await prisma.location.create({
    data: {
      storeId: store.id,
      code: 'WH_001',
      name: 'Main Warehouse',
      type: 'WAREHOUSE',
      isSellableDefault: true,
    },
  });

  const forwarder = await prisma.location.create({
    data: {
      storeId: store.id,
      code: 'FWD_001',
      name: 'China Forwarder',
      type: 'FORWARDER',
      isSellableDefault: false,
    },
  });

  console.log('Created locations:', { warehouse, forwarder });

  // Create a sample SKU
  const sku = await prisma.sKU.create({
    data: {
      storeId: store.id,
      code: 'SKU-001',
      name: 'Sample Product',
      category: 'Electronics',
      brand: 'Sample Brand',
      attributes: {
        color: 'Black',
        size: 'Medium',
      },
    },
  });

  console.log('Created SKU:', sku);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Update `package.json` to add the seed script:

```json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

Install ts-node if needed:

```bash
npm install -D ts-node
```

Run the seed:

```bash
npx prisma db seed
```

## Step 6: Start Development Server

```bash
npm run dev
```

Visit http://localhost:3000 and you should see the application with your seeded data!

## Common Issues & Solutions

### Issue 1: "Connection refused" error

**Problem**: PostgreSQL is not running

**Solution**:
```bash
# Start PostgreSQL
brew services start postgresql@15

# Or manually
pg_ctl -D /opt/homebrew/var/postgresql@15 start
```

### Issue 2: "database does not exist"

**Problem**: Database not created

**Solution**:
```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE erp_v2;
\q
```

### Issue 3: "role does not exist"

**Problem**: User specified in DATABASE_URL doesn't exist

**Solution**: Either:
1. Use your default user (remove username from DATABASE_URL)
2. Create the user in PostgreSQL

### Issue 4: Migration fails

**Problem**: Schema changes conflict

**Solution**:
```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or create a new migration
npx prisma migrate dev --name fix_schema
```

## Useful Commands

```bash
# View database in browser
npx prisma studio

# Reset database (deletes all data)
npx prisma migrate reset

# Create a new migration
npx prisma migrate dev --name migration_name

# Apply migrations in production
npx prisma migrate deploy

# Generate Prisma Client after schema changes
npx prisma generate

# Format schema file
npx prisma format

# Validate schema
npx prisma validate
```

## Database Schema Overview

Your database includes these main tables:

- **Store**: Multi-tenant store management
- **Location**: Warehouses, forwarders, person storage
- **SKU**: Product definitions
- **InventoryLot**: New goods batches
- **ItemUnit**: Individual used/defective items
- **StockLedger**: Inventory change history
- **PurchaseOrder / PurchaseLine**: Procurement
- **CustomerOrder / OrderLine**: Sales
- **OrderAllocation**: Inventory allocation to orders

## Next Steps

1. ✅ Install PostgreSQL
2. ✅ Create database
3. ✅ Configure .env file
4. ✅ Run migrations
5. ✅ (Optional) Seed data
6. ✅ Start development server
7. 🎉 Start building!

## Need Help?

- PostgreSQL docs: https://www.postgresql.org/docs/
- Prisma docs: https://www.prisma.io/docs/
- Check connection: `psql -d erp_v2 -c "SELECT version();"`

# Database Setup - Complete! ✅

## 🎯 Quick Setup (Recommended)

### Option 1: Automated Setup Script

```bash
./setup.sh
```

This script will:
- ✅ Check PostgreSQL installation
- ✅ Start PostgreSQL if needed
- ✅ Create .env file
- ✅ Create database
- ✅ Install dependencies
- ✅ Run migrations
- ✅ Optionally seed sample data

### Option 2: Manual Setup

```bash
# 1. Create database
createdb erp_v2

# 2. Copy environment file
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Seed data (optional)
npm run db:seed

# 6. Start dev server
npm run dev
```

## 📋 What You Get

### Sample Data (if seeded)

**Store:**
- Default Store (STORE_001)

**Locations:**
- Main Warehouse (WH_MAIN) - Sellable
- China Forwarder (FWD_CN) - Not sellable
- Japan Warehouse (WH_JP) - Sellable

**SKUs:**
- Nike Air Max 90 (SHOE-001)
- iPhone 15 Pro (ELEC-001)
- Pokemon Booster Box (TOY-001)

### Database Tables

All tables are created and ready:

**Core:**
- Store
- Location
- SKU

**Inventory:**
- InventoryLot
- ItemUnit
- StockLedger
- InventorySplit

**Procurement:**
- PurchaseOrder
- PurchaseLine

**Sales:**
- CustomerOrder
- OrderLine
- OrderAllocation

**Other:**
- Fee
- Listing
- Platform

## 🛠️ Database Commands

```bash
# View database in browser
npm run db:studio

# Create new migration
npx prisma migrate dev --name migration_name

# Reset database (deletes all data!)
npx prisma migrate reset

# Generate Prisma Client
npm run db:generate

# Seed data
npm run db:seed
```

## 🔍 Verify Setup

### Check Database Connection

```bash
psql -d erp_v2 -c "SELECT version();"
```

### Check Tables

```bash
psql -d erp_v2 -c "\dt"
```

### View Sample Data

```bash
# Open Prisma Studio
npm run db:studio

# Or query directly
psql -d erp_v2 -c "SELECT * FROM stores;"
```

## 📊 Database Schema

Your schema includes:

- **19 tables** with full relationships
- **Decimal precision** for monetary values (19,4)
- **JSON fields** for flexible attributes
- **Indexes** for performance
- **Cascading deletes** for data integrity
- **Timestamps** (createdAt, updatedAt)

## 🚀 Start Development

```bash
# Start the dev server
npm run dev

# Visit the app
open http://localhost:3000

# View database
npm run db:studio
```

## 📚 Documentation

- **Quick Start**: `QUICK_START.md`
- **Detailed Setup**: `DATABASE_SETUP.md`
- **Empty States**: `EMPTY_STATES_COMPLETE.md`
- **Phase Docs**: `PHASE_*.md`

## 🐛 Common Issues

### "Connection refused"
```bash
brew services start postgresql@15
```

### "Database does not exist"
```bash
createdb erp_v2
```

### "Migration failed"
```bash
npx prisma migrate reset
npx prisma migrate dev --name init
```

### "tsx not found"
```bash
npm install -D tsx
```

## ✅ Checklist

- [ ] PostgreSQL installed
- [ ] PostgreSQL running
- [ ] Database created
- [ ] .env configured
- [ ] Dependencies installed
- [ ] Migrations run
- [ ] Sample data seeded (optional)
- [ ] Dev server running
- [ ] Can access http://localhost:3000

## 🎉 You're Ready!

Your database is set up and ready to use. Start exploring:

1. **Inventory Management** - Create locations, SKUs, and lots
2. **Procurement** - Create purchase orders
3. **Sales** - Create customer orders
4. **View Data** - Use Prisma Studio

Happy coding! 🚀

# Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Set Up Environment Variables

```bash
# Copy the example env file
cp .env.example .env
```

Edit `.env` and update the `DATABASE_URL` if needed:

```env
# For default PostgreSQL setup (using your macOS username)
DATABASE_URL="postgresql://localhost:5432/erp_v2?schema=public"

# Or with custom user
DATABASE_URL="postgresql://username:password@localhost:5432/erp_v2?schema=public"
```

### Step 3: Create Database

```bash
# Connect to PostgreSQL
psql postgres

# Create database
CREATE DATABASE erp_v2;

# Exit
\q
```

### Step 4: Run Migrations

```bash
# Generate Prisma Client and run migrations
npx prisma migrate dev --name init
```

### Step 5: Seed Sample Data (Optional)

```bash
# Install tsx if not already installed
npm install -D tsx

# Run seed
npm run db:seed
```

This will create:
- 1 default store
- 3 sample locations (Main Warehouse, China Forwarder, Japan Warehouse)
- 3 sample SKUs (Nike shoes, iPhone, Pokemon cards)

### Step 6: Start Development Server

```bash
npm run dev
```

Visit **http://localhost:3000** 🎉

## 📊 View Your Database

```bash
# Open Prisma Studio
npm run db:studio
```

This opens a visual database browser at **http://localhost:5555**

## 🛠️ Useful Commands

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:generate      # Generate Prisma Client
npm run db:migrate       # Create and run migration
npm run db:push          # Push schema changes (no migration)
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed sample data

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
```

## 🐛 Troubleshooting

### PostgreSQL not installed?

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

### Database connection error?

1. Check PostgreSQL is running:
   ```bash
   brew services list
   ```

2. Verify database exists:
   ```bash
   psql -l | grep erp_v2
   ```

3. Test connection:
   ```bash
   psql -d erp_v2 -c "SELECT version();"
   ```

### Migration errors?

Reset and start fresh:
```bash
npx prisma migrate reset
npx prisma migrate dev --name init
npm run db:seed
```

## 📁 Project Structure

```
erp-v2/
├── app/                    # Next.js app directory
│   ├── (dashboard)/       # Dashboard layout group
│   │   ├── inventory/     # Inventory pages
│   │   ├── procurement/   # Procurement pages
│   │   └── sales/         # Sales pages
│   └── actions/           # Server actions
├── components/            # React components
│   ├── inventory/        # Inventory components
│   ├── procurement/      # Procurement components
│   ├── sales/            # Sales components
│   ├── layout/           # Layout components
│   └── ui/               # UI components (shadcn)
├── lib/                  # Utilities
│   ├── prisma.ts        # Prisma client
│   ├── decimal.ts       # Decimal utilities
│   └── utils.ts         # General utilities
├── prisma/              # Database
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Seed script
└── docs/                # Documentation
```

## 🎯 Next Steps

1. ✅ Database is set up
2. ✅ Sample data is loaded
3. 🎨 Explore the UI at http://localhost:3000
4. 📊 View data at http://localhost:5555 (Prisma Studio)
5. 🚀 Start building!

### Try These Features:

- **Inventory → Locations**: View sample warehouses
- **Inventory → SKUs**: View sample products
- **Inventory → Lots**: Create inventory batches
- **Procurement**: Create purchase orders
- **Sales**: Create customer orders

## 📚 Learn More

- [Full Database Setup Guide](./DATABASE_SETUP.md)
- [Empty States Documentation](./EMPTY_STATES_COMPLETE.md)
- [Phase Completion Docs](./PHASE_*.md)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Next.js Documentation](https://nextjs.org/docs)

## 🆘 Need Help?

Check the detailed guides:
- Database issues → `DATABASE_SETUP.md`
- Project structure → `docs/structure.md`
- Tech stack → `docs/tech-stack.md`

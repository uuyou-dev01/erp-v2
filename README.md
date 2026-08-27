# ERP v0.9.0 Beta — Cross-Border Trading Management

An internal ERP for China/Japan resale operations, multi-company collaboration,
inventory, fulfillment and settlement. The current release is a controlled beta;
public self-registration is disabled and accounts are created through one-time
administrator invitations.

## Features

- **Multi-country Support**: China ↔ Japan, Japan ↔ US/EU, Global ↔ China
- **Inventory Management**: Track both new and used/defective goods
- **Procurement**: Purchase order management with cost formation
- **Sales**: Order processing with inventory allocation
- **Multi-warehouse**: Domestic warehouses, freight forwarders, friend consignment
- **Multi-platform Listings**: Manage listings across multiple marketplaces
- **Organization Collaboration**: Connections, agreements, directed offers, delegated fulfillment and settlement
- **Private Evidence**: Authenticated storage for shipping, inspection, return and payment evidence

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: Tailwind CSS, shadcn/ui components
- **Backend**: Next.js Server Actions
- **Database**: PostgreSQL 17 with Prisma ORM
- **Decimal Handling**: Decimal.js for precise monetary calculations

## Getting Started

### Prerequisites

- Node.js 22
- PostgreSQL 17
- npm

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm ci
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure your database connection.

4. Generate Prisma client:
   ```bash
   npm run db:generate
   ```

5. Run database migrations against a development database:
   ```bash
   npm run db:migrate
   ```

6. Start the development server:
   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm run test` - Run application tests; requires an explicit guarded `TEST_DATABASE_URL`
- `npm run test:e2e` - Run production-build browser tests against a database ending in `_test` or `_e2e`

`db:push`, `db:migrate` and the general demo seed are development-only. UAT and
production use only checked-in migrations through `prisma migrate deploy`.

## Project Structure

```
/
├── app/                    # Next.js app directory
│   ├── (dashboard)/       # Dashboard layout group
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── layout/           # Layout components
│   └── ui/               # UI components (shadcn/ui)
├── lib/                  # Utility functions
│   ├── prisma.ts        # Prisma client
│   └── utils.ts         # Helper functions
├── prisma/              # Database schema
│   └── schema.prisma    # Prisma schema
└── docs/                # Business documentation
```

## Core Modules

### Inventory Module
- Single source of truth for inventory
- Manages Lots (new goods) and ItemUnits (used/individual items)
- All changes tracked via StockLedger

### Procurement Module
- Purchase order management
- Cost calculation with multi-currency support
- Generates inventory at RECEIVED status

### Sales Module
- Order processing
- Inventory allocation (FIFO for lots, explicit for items)
- Fee and discount distribution

### Listing Module
- Multi-platform listing management
- Inventory sync alerts
- Oversell risk detection

## Design Principles

1. **Immutable Costs**: Costs are fixed at inventory formation time
2. **Traceable Changes**: All inventory changes via StockLedger
3. **Allocation Before Confirmation**: Orders must allocate inventory before confirmation
4. **Decimal Precision**: All monetary amounts use Decimal.js
5. **Tenant Boundaries**: Membership plus explicit store, inventory-pool, channel and location grants
6. **SPU-like Product Groups**: 商品组 is the product-family/model container; only 规格 SKU and 独立 SKU can enter procurement, inventory, listings, and sales

## Documentation

See the `/docs` directory for detailed business domain documentation:
- `overview.md` - Project overview
- `domain.md` - Core domain abstractions
- `constraints.md` - System constraints
- `superpowers/plans/2026-07-06-sku-catalog-model-upgrade.md` - 商品组 / 规格 SKU / 独立 SKU upgrade plan
- Module-specific documentation (inventory, procurement, sales, etc.)
- [`docs/releases/v0.9.0.md`](docs/releases/v0.9.0.md) - Release scope, gates, rollback and recovery
- [`docs/deployment/`](docs/deployment/) - Alibaba Cloud deployment, backup and operations runbooks
- [`docs/testing/releases/v0.9.0/`](docs/testing/releases/v0.9.0/) - Current screenshot acceptance evidence

## Production deployment

Production is built from a fixed Git SHA and deployed with Docker Compose. The
application and PostgreSQL ports remain private; only the reverse proxy exposes
80/443. Copy `.env.production.example` to a server-side `.env.production`, use
independent strong secrets, and follow the Alibaba Cloud runbook. Never use the
current developer database as a production migration source.

## License

Private - All rights reserved

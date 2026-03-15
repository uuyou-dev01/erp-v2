# ERP System - Cross-Border Trading Management

A comprehensive ERP system designed for resale/arbitrage businesses across multiple countries and product categories.

## Features

- **Multi-country Support**: China ↔ Japan, Japan ↔ US/EU, Global ↔ China
- **Inventory Management**: Track both new and used/defective goods
- **Procurement**: Purchase order management with cost formation
- **Sales**: Order processing with inventory allocation
- **Multi-warehouse**: Domestic warehouses, freight forwarders, friend consignment
- **Multi-platform Listings**: Manage listings across multiple marketplaces

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript
- **UI**: Tailwind CSS, shadcn/ui components
- **Backend**: Next.js Server Actions
- **Database**: PostgreSQL with Prisma ORM
- **Decimal Handling**: Decimal.js for precise monetary calculations

## Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
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

5. Run database migrations:
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
5. **Multi-tenancy Ready**: All data includes storeId for SaaS support

## Documentation

See the `/docs` directory for detailed business domain documentation:
- `overview.md` - Project overview
- `domain.md` - Core domain abstractions
- `constraints.md` - System constraints
- Module-specific documentation (inventory, procurement, sales, etc.)

## License

Private - All rights reserved

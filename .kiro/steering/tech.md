# Tech Stack & Build System

## Frontend

- **Framework**: Next.js (App Router)
- **Language**: React + TypeScript
- **UI Library**: shadcn/ui as base component library

### React Component Principles

- **Page Component**: Page-level, responsible only for layout and data assembly
- **Feature Component**: Encapsulates a specific business action (e.g., AllocateInventory)
- **UI Component**: Pure presentation, no business logic
- **Forbidden**: Direct cost/recommendation calculations in components

## Backend

- **Framework**: Next.js Server Actions / API Routes
- **ORM**: Prisma
- **Database**: PostgreSQL (primary)

## Task Processing & Computation

- **Queue**: Redis + BullMQ for queuing and scheduled tasks
- **Processing**: Offline batch processing (daily + event-triggered)
- **Decimal Handling**: Decimal.js for all monetary calculations

## Intelligence Strategy

- Rule-based and statistical approaches (MVP)
- Recommendation results stored in tables (Snapshot / Recommendation)
- Future extensibility: price scraping workers, ML services

## Not Used

- NoSQL as primary accounting database (unsuitable for accounting/audit requirements)

## Common Commands

When working with this codebase, typical commands include:

```bash
# Development
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server

# Database
npx prisma migrate dev    # Run migrations in development
npx prisma generate       # Generate Prisma client
npx prisma studio         # Open Prisma Studio

# Testing
npm test             # Run tests
npm run test:watch   # Run tests in watch mode

# Linting & Formatting
npm run lint         # Run ESLint
npm run format       # Format code
```

## Key Technical Constraints

- All monetary amounts must use Decimal.js (never native JavaScript numbers)
- All business data must include `storeId` (SaaS multi-tenancy preparation)
- All inventory changes must write to StockLedger
- Costs (unitCost) are immutable once set
- Recommendation results must include algorithm version and input snapshot

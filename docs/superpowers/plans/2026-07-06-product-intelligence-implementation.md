# Product Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone 商品情报 module for member-shared product knowledge and market observations.

**Architecture:** Product intelligence is separate from SKU, inventory, procurement, marketplace, and resale flows. A product intelligence item stores the shared product card; observations store member price/experience records under that card.

**Tech Stack:** Next.js App Router, React server components, server actions, Prisma/Postgres, Vitest.

---

### Task 1: Data Model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260706133000_add_product_intelligence/migration.sql`

- [ ] Add `ProductIntelligenceItem` and `ProductIntelligenceObservation` models.
- [ ] Link items and observations to `Store`.
- [ ] Add indexes for visibility, status, category, store, and observed date.
- [ ] Run `npx prisma format && npx prisma validate`.

### Task 2: Server Actions

**Files:**
- Create: `app/actions/product-intelligence.ts`
- Test: `tests/application/product-intelligence.test.ts`

- [ ] Implement list/detail queries that return public items plus current-store-owned items.
- [ ] Implement create/update/delete item actions.
- [ ] Implement add/delete observation actions.
- [ ] Enforce owner-only mutations for item edit/delete and observation delete.
- [ ] Run `npx vitest run tests/application/product-intelligence.test.ts`.

### Task 3: UI

**Files:**
- Create: `components/product-intelligence/product-intelligence-form.tsx`
- Create: `components/product-intelligence/observation-form.tsx`
- Create: `components/product-intelligence/product-intelligence-actions.tsx`
- Create: `components/product-intelligence/product-intelligence-status.tsx`
- Create: `app/(dashboard)/product-intelligence/page.tsx`
- Create: `app/(dashboard)/product-intelligence/new/page.tsx`
- Create: `app/(dashboard)/product-intelligence/[id]/page.tsx`
- Create: `app/(dashboard)/product-intelligence/[id]/edit/page.tsx`
- Modify: `config/navigation.ts`

- [ ] Build list, detail, create, and edit pages.
- [ ] Add search/filter controls through URL query parameters.
- [ ] Add navigation entry and command quick action.
- [ ] Keep the module data-display-first; do not create procurement, SKU, listing, or supply-offer records.

### Task 4: Verification

**Files:**
- Modify: `tests/application/navigation.test.ts`
- Test: `tests/application/product-intelligence.test.ts`

- [ ] Verify navigation contains `/product-intelligence`.
- [ ] Verify visibility and owner mutation rules.
- [ ] Run `npx prisma format && npx prisma validate && npm run db:generate && npm run typecheck && npm test && npm run build`.

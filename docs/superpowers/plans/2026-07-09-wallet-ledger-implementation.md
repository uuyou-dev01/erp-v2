# Wallet Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first auditable wallet layer for user, partner, and platform balances, manual withdrawal requests, and future earnings settlement.

**Architecture:** Wallet balances are derived from ledger entries, not stored as editable balance fields. Earnings rules and events are modeled separately from wallet ledgers so future代卖、代发、服务费 and platform revenue rules can be configured without hard-coding all formulas into one report page.

**Tech Stack:** Next.js Server Actions, Prisma/PostgreSQL, Decimal.js, Vitest, Tailwind UI components.

---

### Task 1: Wallet Domain Functions

**Files:**
- Create: `lib/application/wallet-ledger.ts`
- Test: `tests/application/wallet-ledger.test.ts`

- [ ] Write failing tests for deriving available, pending, and withdrawn balances from ledger entries.
- [ ] Implement a pure `summarizeWalletLedger` helper that handles `CREDIT`, `DEBIT`, `HOLD`, `RELEASE`, `WITHDRAWAL`, `ADJUSTMENT`, and ignores `VOID` entries.
- [ ] Verify with `npm test -- tests/application/wallet-ledger.test.ts`.

### Task 2: Prisma Wallet And Earnings Models

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260709090000_add_wallet_earnings/migration.sql`

- [ ] Add `EarningRule`, `EarningEvent`, `WalletAccount`, `WalletLedgerEntry`, `WithdrawalRequest`, and `PayoutRecord`.
- [ ] Use polymorphic owner fields (`ownerType`, `ownerId`) so first release supports `USER`, `PARTNER`, and `PLATFORM` without forcing one account ownership model.
- [ ] Add indexes for store, owner, wallet, status, source, and withdrawal lookups.

### Task 3: Wallet Server Actions

**Files:**
- Create: `app/actions/wallet.ts`
- Test: `tests/application/wallet-actions.test.ts`

- [ ] Add `getWalletOverview` for the current user wallet.
- [ ] Add `requestWalletWithdrawalAction` that validates amount, creates a hold ledger entry, and opens a withdrawal request.
- [ ] Add `markWithdrawalPaidAction` for manual payout completion, recording payout metadata and final withdrawal ledger entry.

### Task 4: Wallet Page And Navigation

**Files:**
- Create: `app/(dashboard)/finance/wallet/page.tsx`
- Create: `components/finance/withdrawal-request-form.tsx`
- Modify: `config/navigation.ts`

- [ ] Add a wallet page with balance cards, ledger rows, and withdrawal requests.
- [ ] Add a withdrawal form for manual payout requests.
- [ ] Add "钱包" to the finance navigation and command palette.

### Task 5: Verification

**Files:**
- Existing project test and typecheck scripts.

- [ ] Run `npm test -- tests/application/wallet-ledger.test.ts tests/application/wallet-actions.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] If typecheck exposes pre-existing dirty-worktree issues, report them separately and keep wallet changes isolated.

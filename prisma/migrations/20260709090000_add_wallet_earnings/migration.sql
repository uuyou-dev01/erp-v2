-- Wallet, earning rule, earning event, and manual withdrawal ledger tables.

CREATE TABLE "earning_rules" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "partnerId" TEXT,
  "name" TEXT NOT NULL,
  "ruleType" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL DEFAULT 'STORE',
  "scopeId" TEXT,
  "calculationType" TEXT NOT NULL,
  "rate" DECIMAL(8,4),
  "fixedAmount" DECIMAL(19,4),
  "currency" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "earning_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_accounts" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "earning_events" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "walletAccountId" TEXT,
  "earningRuleId" TEXT,
  "partnerId" TEXT,
  "userId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "earningType" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "grossAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "costAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "baseAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "earningAmount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "earning_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "withdrawal_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "walletAccountId" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "paymentMethod" TEXT,
  "paymentAccount" TEXT,
  "accountName" TEXT,
  "note" TEXT,
  "requestedById" TEXT,
  "reviewedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wallet_ledger_entries" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "walletAccountId" TEXT NOT NULL,
  "withdrawalRequestId" TEXT,
  "earningEventId" TEXT,
  "entryType" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'POSTED',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "description" TEXT,
  "metadata" JSONB,
  "postedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payout_records" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "walletAccountId" TEXT NOT NULL,
  "withdrawalRequestId" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PAID',
  "paymentMethod" TEXT,
  "paymentAccount" TEXT,
  "accountName" TEXT,
  "proofUrl" TEXT,
  "note" TEXT,
  "paidById" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "earning_rules_storeId_idx" ON "earning_rules"("storeId");
CREATE INDEX "earning_rules_partnerId_idx" ON "earning_rules"("partnerId");
CREATE INDEX "earning_rules_ruleType_idx" ON "earning_rules"("ruleType");
CREATE INDEX "earning_rules_scopeType_scopeId_idx" ON "earning_rules"("scopeType", "scopeId");
CREATE INDEX "earning_rules_status_idx" ON "earning_rules"("status");

CREATE UNIQUE INDEX "wallet_accounts_storeId_ownerType_ownerId_currency_key" ON "wallet_accounts"("storeId", "ownerType", "ownerId", "currency");
CREATE INDEX "wallet_accounts_storeId_idx" ON "wallet_accounts"("storeId");
CREATE INDEX "wallet_accounts_ownerType_ownerId_idx" ON "wallet_accounts"("ownerType", "ownerId");
CREATE INDEX "wallet_accounts_status_idx" ON "wallet_accounts"("status");

CREATE INDEX "earning_events_storeId_idx" ON "earning_events"("storeId");
CREATE INDEX "earning_events_walletAccountId_idx" ON "earning_events"("walletAccountId");
CREATE INDEX "earning_events_earningRuleId_idx" ON "earning_events"("earningRuleId");
CREATE INDEX "earning_events_partnerId_idx" ON "earning_events"("partnerId");
CREATE INDEX "earning_events_userId_idx" ON "earning_events"("userId");
CREATE INDEX "earning_events_sourceType_sourceId_idx" ON "earning_events"("sourceType", "sourceId");
CREATE INDEX "earning_events_earningType_idx" ON "earning_events"("earningType");
CREATE INDEX "earning_events_status_idx" ON "earning_events"("status");
CREATE INDEX "earning_events_occurredAt_idx" ON "earning_events"("occurredAt");

CREATE UNIQUE INDEX "withdrawal_requests_storeId_requestNo_key" ON "withdrawal_requests"("storeId", "requestNo");
CREATE INDEX "withdrawal_requests_storeId_idx" ON "withdrawal_requests"("storeId");
CREATE INDEX "withdrawal_requests_walletAccountId_idx" ON "withdrawal_requests"("walletAccountId");
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");
CREATE INDEX "withdrawal_requests_requestedById_idx" ON "withdrawal_requests"("requestedById");
CREATE INDEX "withdrawal_requests_createdAt_idx" ON "withdrawal_requests"("createdAt");

CREATE INDEX "wallet_ledger_entries_storeId_idx" ON "wallet_ledger_entries"("storeId");
CREATE INDEX "wallet_ledger_entries_walletAccountId_idx" ON "wallet_ledger_entries"("walletAccountId");
CREATE INDEX "wallet_ledger_entries_withdrawalRequestId_idx" ON "wallet_ledger_entries"("withdrawalRequestId");
CREATE INDEX "wallet_ledger_entries_earningEventId_idx" ON "wallet_ledger_entries"("earningEventId");
CREATE INDEX "wallet_ledger_entries_entryType_idx" ON "wallet_ledger_entries"("entryType");
CREATE INDEX "wallet_ledger_entries_status_idx" ON "wallet_ledger_entries"("status");
CREATE INDEX "wallet_ledger_entries_sourceType_sourceId_idx" ON "wallet_ledger_entries"("sourceType", "sourceId");
CREATE INDEX "wallet_ledger_entries_createdAt_idx" ON "wallet_ledger_entries"("createdAt");

CREATE INDEX "payout_records_storeId_idx" ON "payout_records"("storeId");
CREATE INDEX "payout_records_walletAccountId_idx" ON "payout_records"("walletAccountId");
CREATE INDEX "payout_records_withdrawalRequestId_idx" ON "payout_records"("withdrawalRequestId");
CREATE INDEX "payout_records_status_idx" ON "payout_records"("status");
CREATE INDEX "payout_records_paidAt_idx" ON "payout_records"("paidAt");

ALTER TABLE "earning_rules" ADD CONSTRAINT "earning_rules_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "earning_events" ADD CONSTRAINT "earning_events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "earning_events" ADD CONSTRAINT "earning_events_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "earning_events" ADD CONSTRAINT "earning_events_earningRuleId_fkey" FOREIGN KEY ("earningRuleId") REFERENCES "earning_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_earningEventId_fkey" FOREIGN KEY ("earningEventId") REFERENCES "earning_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_walletAccountId_fkey" FOREIGN KEY ("walletAccountId") REFERENCES "wallet_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout_records" ADD CONSTRAINT "payout_records_withdrawalRequestId_fkey" FOREIGN KEY ("withdrawalRequestId") REFERENCES "withdrawal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

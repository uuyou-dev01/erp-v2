-- Multi-party ownership, warehouse collaboration and operational sub-ledger.
-- The migration is intentionally additive and idempotent: legacy store/platform
-- columns remain available while application code dual-writes the new scopes.

ALTER TABLE "locations" ADD COLUMN IF NOT EXISTS "operatorOrganizationId" TEXT;
ALTER TABLE "skus" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "inventory_lots" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "item_units" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "stock_ledgers" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "opening_stocks" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "inventory_splits" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "customer_orders" ADD COLUMN IF NOT EXISTS "salesChannelAccountId" TEXT;
ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "salesChannelAccountId" TEXT;
ALTER TABLE "supply_offers" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "supply_offers" ADD COLUMN IF NOT EXISTS "providerOrganizationId" TEXT;
ALTER TABLE "resale_listings" ADD COLUMN IF NOT EXISTS "salesChannelAccountId" TEXT;
ALTER TABLE "resale_listings" ADD COLUMN IF NOT EXISTS "sellerOrganizationId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "requesterOrganizationId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "providerOrganizationId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "fulfillmentLocationId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;
ALTER TABLE "fulfillment_requests" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "payerOrganizationId" TEXT;
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "payeeOrganizationId" TEXT;
ALTER TABLE "inbound_shipments" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "consolidation_batches" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "inspection_events" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;
ALTER TABLE "inspection_events" ADD COLUMN IF NOT EXISTS "afterSalesCaseId" TEXT;
ALTER TABLE "quick_entries" ADD COLUMN IF NOT EXISTS "inventoryPoolId" TEXT;

CREATE TABLE IF NOT EXISTS "inventory_pools" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "legacyStoreId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "baseCurrency" TEXT NOT NULL DEFAULT 'CNY',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_pools_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_pools_legacyStoreId_fkey" FOREIGN KEY ("legacyStoreId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "inventory_pool_accesses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "inventoryPoolId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "permissions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inventory_pool_accesses_inventoryPoolId_fkey" FOREIGN KEY ("inventoryPoolId") REFERENCES "inventory_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inventory_pool_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "sales_channel_accounts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "legacyPlatformId" TEXT,
  "platformCode" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "externalAccountId" TEXT,
  "country" TEXT,
  "defaultCurrency" TEXT,
  "credentialRef" TEXT,
  "settings" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_channel_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sales_channel_accounts_legacyPlatformId_fkey" FOREIGN KEY ("legacyPlatformId") REFERENCES "platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "channel_accesses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "salesChannelAccountId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "permissions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_accesses_salesChannelAccountId_fkey" FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "channel_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "location_accesses" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "locationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'VIEWER',
  "permissions" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_accesses_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "location_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "service_agreements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clientOrganizationId" TEXT NOT NULL,
  "providerOrganizationId" TEXT NOT NULL,
  "inventoryPoolId" TEXT,
  "locationId" TEXT,
  "serviceTypes" JSONB NOT NULL,
  "settlementCurrency" TEXT NOT NULL,
  "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_agreements_clientOrganizationId_fkey" FOREIGN KEY ("clientOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_agreements_providerOrganizationId_fkey" FOREIGN KEY ("providerOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "service_agreements_inventoryPoolId_fkey" FOREIGN KEY ("inventoryPoolId") REFERENCES "inventory_pools"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "service_agreements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "charge_categories" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT,
  "scope" TEXT NOT NULL DEFAULT 'ORGANIZATION',
  "groupCode" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charge_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "charge_rules" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "serviceAgreementId" TEXT,
  "categoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "calculationMethod" TEXT NOT NULL DEFAULT 'MANUAL',
  "fixedAmount" DECIMAL(19,4),
  "rate" DECIMAL(12,8),
  "currency" TEXT,
  "config" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "effectiveFrom" TIMESTAMP(3),
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charge_rules_serviceAgreementId_fkey" FOREIGN KEY ("serviceAgreementId") REFERENCES "service_agreements"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "charge_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "charge_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "charge_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "ruleId" TEXT,
  "reversalOfId" TEXT,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "amountKind" TEXT NOT NULL DEFAULT 'ACTUAL',
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "baseCurrency" TEXT,
  "fxRate" DECIMAL(19,8),
  "baseAmount" DECIMAL(19,4),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "description" TEXT NOT NULL,
  "evidence" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedById" TEXT,
  "submittedAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "disputedById" TEXT,
  "disputedAt" TIMESTAMP(3),
  "disputeReason" TEXT,
  "voidedById" TEXT,
  "voidedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "charge_events_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "charge_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "charge_events_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "charge_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "charge_events_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "charge_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "charge_parties" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chargeEventId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "partyType" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "organizationId" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charge_parties_chargeEventId_fkey" FOREIGN KEY ("chargeEventId") REFERENCES "charge_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "charge_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chargeEventId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "allocationMethod" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "charge_allocations_chargeEventId_fkey" FOREIGN KEY ("chargeEventId") REFERENCES "charge_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "settlement_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "settlementId" TEXT NOT NULL,
  "chargeEventId" TEXT NOT NULL,
  "amount" DECIMAL(19,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "settlement_items_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "settlement_items_chargeEventId_fkey" FOREIGN KEY ("chargeEventId") REFERENCES "charge_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "channel_statements" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "salesChannelAccountId" TEXT NOT NULL,
  "externalStatementNo" TEXT,
  "periodStart" TIMESTAMP(3),
  "periodEnd" TIMESTAMP(3),
  "currency" TEXT NOT NULL,
  "grossSales" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalFees" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalRefunds" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "totalAdjustments" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "netPayout" DECIMAL(19,4) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "paidAt" TIMESTAMP(3),
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "channel_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "channel_statements_salesChannelAccountId_fkey" FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "channel_statement_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "statementId" TEXT NOT NULL,
  "externalLineId" TEXT,
  "lineType" TEXT NOT NULL,
  "orderId" TEXT,
  "externalOrderNo" TEXT,
  "amount" DECIMAL(19,4) NOT NULL,
  "currency" TEXT NOT NULL,
  "description" TEXT,
  "occurredAt" TIMESTAMP(3),
  "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
  "chargeEventId" TEXT,
  "rawData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channel_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "channel_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "after_sales_cases" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "customerOrderId" TEXT NOT NULL,
  "caseNo" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "reason" TEXT NOT NULL,
  "responsibility" TEXT,
  "refundAmount" DECIMAL(19,4),
  "refundCurrency" TEXT,
  "targetLocationId" TEXT,
  "evidence" JSONB,
  "requestedById" TEXT,
  "authorizedById" TEXT,
  "resolvedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorizedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "after_sales_cases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "after_sales_cases_customerOrderId_fkey" FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "after_sales_lines" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "afterSalesCaseId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "quantity" DECIMAL(19,4) NOT NULL,
  "resolution" TEXT,
  "conditionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "after_sales_lines_afterSalesCaseId_fkey" FOREIGN KEY ("afterSalesCaseId") REFERENCES "after_sales_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "after_sales_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "after_sales_receipts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "afterSalesLineId" TEXT NOT NULL,
  "orderAllocationId" TEXT NOT NULL,
  "returnedLotId" TEXT,
  "itemUnitId" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RETURN_CHECK',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "after_sales_receipts_afterSalesLineId_fkey" FOREIGN KEY ("afterSalesLineId") REFERENCES "after_sales_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "after_sales_shipments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "afterSalesCaseId" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'RETURN',
  "fromLocationId" TEXT,
  "toLocationId" TEXT,
  "carrier" TEXT,
  "trackingNo" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "after_sales_shipments_afterSalesCaseId_fkey" FOREIGN KEY ("afterSalesCaseId") REFERENCES "after_sales_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "fulfillment_inventory_allocations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fulfillmentRequestId" TEXT NOT NULL,
  "lotId" TEXT,
  "itemUnitId" TEXT,
  "quantity" DECIMAL(19,4) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ALLOCATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "fulfillment_inventory_allocations_fulfillmentRequestId_fkey" FOREIGN KEY ("fulfillmentRequestId") REFERENCES "fulfillment_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "inventory_pools_legacyStoreId_key" ON "inventory_pools"("legacyStoreId");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_pools_organizationId_code_key" ON "inventory_pools"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "inventory_pools_organizationId_status_idx" ON "inventory_pools"("organizationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_pool_accesses_inventoryPoolId_userId_key" ON "inventory_pool_accesses"("inventoryPoolId", "userId");
CREATE INDEX IF NOT EXISTS "inventory_pool_accesses_userId_idx" ON "inventory_pool_accesses"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_channel_accounts_legacyPlatformId_key" ON "sales_channel_accounts"("legacyPlatformId");
CREATE UNIQUE INDEX IF NOT EXISTS "sales_channel_accounts_organizationId_code_key" ON "sales_channel_accounts"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "sales_channel_accounts_organizationId_status_idx" ON "sales_channel_accounts"("organizationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "channel_accesses_salesChannelAccountId_userId_key" ON "channel_accesses"("salesChannelAccountId", "userId");
CREATE INDEX IF NOT EXISTS "channel_accesses_userId_idx" ON "channel_accesses"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "location_accesses_locationId_userId_key" ON "location_accesses"("locationId", "userId");
CREATE INDEX IF NOT EXISTS "location_accesses_userId_idx" ON "location_accesses"("userId");
CREATE INDEX IF NOT EXISTS "service_agreements_clientOrganizationId_status_idx" ON "service_agreements"("clientOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "service_agreements_providerOrganizationId_status_idx" ON "service_agreements"("providerOrganizationId", "status");
CREATE INDEX IF NOT EXISTS "service_agreements_inventoryPoolId_idx" ON "service_agreements"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "service_agreements_locationId_idx" ON "service_agreements"("locationId");
CREATE UNIQUE INDEX IF NOT EXISTS "charge_categories_organizationId_code_key" ON "charge_categories"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "charge_categories_scope_groupCode_status_idx" ON "charge_categories"("scope", "groupCode", "status");
CREATE INDEX IF NOT EXISTS "charge_rules_organizationId_status_idx" ON "charge_rules"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "charge_rules_serviceAgreementId_idx" ON "charge_rules"("serviceAgreementId");
CREATE INDEX IF NOT EXISTS "charge_rules_categoryId_idx" ON "charge_rules"("categoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "charge_events_organizationId_idempotencyKey_key" ON "charge_events"("organizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "charge_events_organizationId_status_occurredAt_idx" ON "charge_events"("organizationId", "status", "occurredAt");
CREATE INDEX IF NOT EXISTS "charge_events_sourceType_sourceId_idx" ON "charge_events"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "charge_events_categoryId_idx" ON "charge_events"("categoryId");
CREATE INDEX IF NOT EXISTS "charge_events_reversalOfId_idx" ON "charge_events"("reversalOfId");
CREATE UNIQUE INDEX IF NOT EXISTS "charge_parties_chargeEventId_role_partyType_partyId_key" ON "charge_parties"("chargeEventId", "role", "partyType", "partyId");
CREATE INDEX IF NOT EXISTS "charge_parties_organizationId_role_idx" ON "charge_parties"("organizationId", "role");
CREATE INDEX IF NOT EXISTS "charge_parties_partyType_partyId_idx" ON "charge_parties"("partyType", "partyId");
CREATE INDEX IF NOT EXISTS "charge_allocations_chargeEventId_idx" ON "charge_allocations"("chargeEventId");
CREATE INDEX IF NOT EXISTS "charge_allocations_targetType_targetId_idx" ON "charge_allocations"("targetType", "targetId");
CREATE UNIQUE INDEX IF NOT EXISTS "settlement_items_settlementId_chargeEventId_key" ON "settlement_items"("settlementId", "chargeEventId");
CREATE INDEX IF NOT EXISTS "settlement_items_chargeEventId_idx" ON "settlement_items"("chargeEventId");
CREATE UNIQUE INDEX IF NOT EXISTS "channel_statements_salesChannelAccountId_externalStatementN_key" ON "channel_statements"("salesChannelAccountId", "externalStatementNo");
CREATE INDEX IF NOT EXISTS "channel_statements_organizationId_status_idx" ON "channel_statements"("organizationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "channel_statement_lines_statementId_externalLineId_key" ON "channel_statement_lines"("statementId", "externalLineId");
CREATE INDEX IF NOT EXISTS "channel_statement_lines_statementId_matchStatus_idx" ON "channel_statement_lines"("statementId", "matchStatus");
CREATE INDEX IF NOT EXISTS "channel_statement_lines_orderId_idx" ON "channel_statement_lines"("orderId");
CREATE INDEX IF NOT EXISTS "channel_statement_lines_externalOrderNo_idx" ON "channel_statement_lines"("externalOrderNo");
CREATE UNIQUE INDEX IF NOT EXISTS "after_sales_cases_organizationId_caseNo_key" ON "after_sales_cases"("organizationId", "caseNo");
CREATE INDEX IF NOT EXISTS "after_sales_cases_customerOrderId_status_idx" ON "after_sales_cases"("customerOrderId", "status");
CREATE INDEX IF NOT EXISTS "after_sales_cases_targetLocationId_idx" ON "after_sales_cases"("targetLocationId");
CREATE UNIQUE INDEX IF NOT EXISTS "after_sales_lines_afterSalesCaseId_orderLineId_key" ON "after_sales_lines"("afterSalesCaseId", "orderLineId");
CREATE INDEX IF NOT EXISTS "after_sales_lines_orderLineId_idx" ON "after_sales_lines"("orderLineId");
CREATE UNIQUE INDEX IF NOT EXISTS "after_sales_receipts_afterSalesLineId_orderAllocationId_key" ON "after_sales_receipts"("afterSalesLineId", "orderAllocationId");
CREATE INDEX IF NOT EXISTS "after_sales_receipts_returnedLotId_idx" ON "after_sales_receipts"("returnedLotId");
CREATE INDEX IF NOT EXISTS "after_sales_receipts_itemUnitId_idx" ON "after_sales_receipts"("itemUnitId");
CREATE INDEX IF NOT EXISTS "after_sales_shipments_afterSalesCaseId_status_idx" ON "after_sales_shipments"("afterSalesCaseId", "status");
CREATE INDEX IF NOT EXISTS "after_sales_shipments_trackingNo_idx" ON "after_sales_shipments"("trackingNo");
CREATE INDEX IF NOT EXISTS "fulfillment_inventory_allocations_fulfillmentRequestId_stat_idx" ON "fulfillment_inventory_allocations"("fulfillmentRequestId", "status");
CREATE INDEX IF NOT EXISTS "fulfillment_inventory_allocations_lotId_idx" ON "fulfillment_inventory_allocations"("lotId");
CREATE INDEX IF NOT EXISTS "fulfillment_inventory_allocations_itemUnitId_idx" ON "fulfillment_inventory_allocations"("itemUnitId");

CREATE INDEX IF NOT EXISTS "locations_operatorOrganizationId_idx" ON "locations"("operatorOrganizationId");
CREATE INDEX IF NOT EXISTS "skus_inventoryPoolId_idx" ON "skus"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "inventory_lots_inventoryPoolId_idx" ON "inventory_lots"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "item_units_inventoryPoolId_idx" ON "item_units"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "stock_ledgers_inventoryPoolId_idx" ON "stock_ledgers"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "opening_stocks_inventoryPoolId_idx" ON "opening_stocks"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "inventory_splits_inventoryPoolId_idx" ON "inventory_splits"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "purchase_orders_inventoryPoolId_idx" ON "purchase_orders"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "customer_orders_salesChannelAccountId_idx" ON "customer_orders"("salesChannelAccountId");
CREATE INDEX IF NOT EXISTS "listings_salesChannelAccountId_idx" ON "listings"("salesChannelAccountId");
CREATE INDEX IF NOT EXISTS "supply_offers_inventoryPoolId_idx" ON "supply_offers"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "supply_offers_providerOrganizationId_idx" ON "supply_offers"("providerOrganizationId");
CREATE INDEX IF NOT EXISTS "resale_listings_salesChannelAccountId_idx" ON "resale_listings"("salesChannelAccountId");
CREATE INDEX IF NOT EXISTS "resale_listings_sellerOrganizationId_idx" ON "resale_listings"("sellerOrganizationId");
CREATE INDEX IF NOT EXISTS "fulfillment_requests_requesterOrganizationId_idx" ON "fulfillment_requests"("requesterOrganizationId");
CREATE INDEX IF NOT EXISTS "fulfillment_requests_providerOrganizationId_idx" ON "fulfillment_requests"("providerOrganizationId");
CREATE INDEX IF NOT EXISTS "fulfillment_requests_inventoryPoolId_idx" ON "fulfillment_requests"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "fulfillment_requests_fulfillmentLocationId_idx" ON "fulfillment_requests"("fulfillmentLocationId");
CREATE INDEX IF NOT EXISTS "fulfillment_requests_assignedToId_idx" ON "fulfillment_requests"("assignedToId");
CREATE UNIQUE INDEX IF NOT EXISTS "fulfillment_requests_requesterOrganizationId_idempotencyKey_key" ON "fulfillment_requests"("requesterOrganizationId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "settlements_payerOrganizationId_idx" ON "settlements"("payerOrganizationId");
CREATE INDEX IF NOT EXISTS "settlements_payeeOrganizationId_idx" ON "settlements"("payeeOrganizationId");
CREATE INDEX IF NOT EXISTS "inbound_shipments_inventoryPoolId_idx" ON "inbound_shipments"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "consolidation_batches_inventoryPoolId_idx" ON "consolidation_batches"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "inspection_events_inventoryPoolId_idx" ON "inspection_events"("inventoryPoolId");
CREATE INDEX IF NOT EXISTS "inspection_events_afterSalesCaseId_idx" ON "inspection_events"("afterSalesCaseId");
CREATE INDEX IF NOT EXISTS "quick_entries_inventoryPoolId_idx" ON "quick_entries"("inventoryPoolId");

-- Foreign keys on legacy tables are added after the new tables exist. The DO
-- blocks keep the migration safe for installations that previously used db push.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_operatorOrganizationId_fkey') THEN
    ALTER TABLE "locations" ADD CONSTRAINT "locations_operatorOrganizationId_fkey" FOREIGN KEY ("operatorOrganizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'customer_orders_salesChannelAccountId_fkey') THEN
    ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_salesChannelAccountId_fkey" FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_salesChannelAccountId_fkey') THEN
    ALTER TABLE "listings" ADD CONSTRAINT "listings_salesChannelAccountId_fkey" FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'resale_listings_salesChannelAccountId_fkey') THEN
    ALTER TABLE "resale_listings" ADD CONSTRAINT "resale_listings_salesChannelAccountId_fkey" FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inspection_events_afterSalesCaseId_fkey') THEN
    ALTER TABLE "inspection_events" ADD CONSTRAINT "inspection_events_afterSalesCaseId_fkey" FOREIGN KEY ("afterSalesCaseId") REFERENCES "after_sales_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Existing Store rows become the initial inventory pools. IDs are deterministic
-- only for migrated rows; runtime creation continues to use Prisma cuid values.
INSERT INTO "inventory_pools" ("id", "organizationId", "legacyStoreId", "code", "name", "baseCurrency", "status", "createdAt", "updatedAt")
SELECT 'migr_pool_' || md5(s."id"), s."organizationId", s."id", s."code", s."name", s."currency", 'ACTIVE', s."createdAt", CURRENT_TIMESTAMP
FROM "stores" s
WHERE s."organizationId" IS NOT NULL
ON CONFLICT ("legacyStoreId") DO NOTHING;

INSERT INTO "inventory_pool_accesses" ("id", "inventoryPoolId", "userId", "role", "permissions", "createdAt", "updatedAt")
SELECT 'migr_pool_access_' || md5(sa."storeId" || ':' || sa."userId"), ip."id", sa."userId", sa."role", sa."permissions", sa."createdAt", CURRENT_TIMESTAMP
FROM "store_accesses" sa
JOIN "inventory_pools" ip ON ip."legacyStoreId" = sa."storeId"
ON CONFLICT ("inventoryPoolId", "userId") DO NOTHING;

INSERT INTO "sales_channel_accounts" ("id", "organizationId", "legacyPlatformId", "platformCode", "code", "name", "defaultCurrency", "status", "createdAt", "updatedAt")
SELECT 'migr_channel_' || md5(p."id"), s."organizationId", p."id", p."code", s."code" || '_' || p."code", p."name", s."currency", 'ACTIVE', p."createdAt", CURRENT_TIMESTAMP
FROM "platforms" p
JOIN "stores" s ON s."id" = p."storeId"
WHERE s."organizationId" IS NOT NULL
ON CONFLICT ("legacyPlatformId") DO NOTHING;

INSERT INTO "channel_accesses" ("id", "salesChannelAccountId", "userId", "role", "permissions", "createdAt", "updatedAt")
SELECT 'migr_channel_access_' || md5(sa."storeId" || ':' || sa."userId" || ':' || sca."id"), sca."id", sa."userId", sa."role", sa."permissions", sa."createdAt", CURRENT_TIMESTAMP
FROM "store_accesses" sa
JOIN "platforms" p ON p."storeId" = sa."storeId"
JOIN "sales_channel_accounts" sca ON sca."legacyPlatformId" = p."id"
ON CONFLICT ("salesChannelAccountId", "userId") DO NOTHING;

INSERT INTO "location_accesses" ("id", "locationId", "userId", "role", "permissions", "createdAt", "updatedAt")
SELECT 'migr_location_access_' || md5(l."id" || ':' || sa."userId"), l."id", sa."userId", sa."role", sa."permissions", sa."createdAt", CURRENT_TIMESTAMP
FROM "locations" l
JOIN "store_accesses" sa ON sa."storeId" = l."storeId"
ON CONFLICT ("locationId", "userId") DO NOTHING;

UPDATE "locations" l SET "operatorOrganizationId" = s."organizationId" FROM "stores" s WHERE l."storeId" = s."id" AND l."operatorOrganizationId" IS NULL;
UPDATE "skus" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "inventory_lots" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "item_units" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "stock_ledgers" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "opening_stocks" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "inventory_splits" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "purchase_orders" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "supply_offers" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "inbound_shipments" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "consolidation_batches" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "inspection_events" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "quick_entries" t SET "inventoryPoolId" = ip."id" FROM "inventory_pools" ip WHERE t."storeId" = ip."legacyStoreId" AND t."inventoryPoolId" IS NULL;
UPDATE "listings" t SET "salesChannelAccountId" = sca."id" FROM "sales_channel_accounts" sca WHERE t."platformId" = sca."legacyPlatformId" AND t."salesChannelAccountId" IS NULL;
UPDATE "resale_listings" t SET "salesChannelAccountId" = sca."id" FROM "sales_channel_accounts" sca WHERE t."platformId" = sca."legacyPlatformId" AND t."salesChannelAccountId" IS NULL;
UPDATE "customer_orders" t SET "salesChannelAccountId" = sca."id" FROM "sales_channel_accounts" sca WHERE t."platformId" = sca."legacyPlatformId" AND t."salesChannelAccountId" IS NULL;
UPDATE "supply_offers" t SET "providerOrganizationId" = s."organizationId" FROM "stores" s WHERE t."storeId" = s."id" AND t."providerOrganizationId" IS NULL;
UPDATE "resale_listings" t SET "sellerOrganizationId" = s."organizationId" FROM "stores" s WHERE t."storeId" = s."id" AND t."sellerOrganizationId" IS NULL;

INSERT INTO "charge_categories" ("id", "organizationId", "scope", "groupCode", "code", "name", "status", "createdAt", "updatedAt") VALUES
  ('system_charge_platform_fee', NULL, 'SYSTEM', 'PLATFORM', 'PLATFORM_FEE', '平台费用', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_shipping', NULL, 'SYSTEM', 'SHIPPING', 'SHIPPING', '运输费用', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_fulfillment', NULL, 'SYSTEM', 'FULFILLMENT', 'FULFILLMENT', '代发服务', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_inspection', NULL, 'SYSTEM', 'INSPECTION', 'INSPECTION', '检查服务', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_storage', NULL, 'SYSTEM', 'STORAGE', 'STORAGE', '仓储费用', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_packaging', NULL, 'SYSTEM', 'PACKAGING', 'PACKAGING', '包材费用', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_after_sales', NULL, 'SYSTEM', 'AFTER_SALES', 'AFTER_SALES', '退货售后', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_tax_duty', NULL, 'SYSTEM', 'TAX_DUTY', 'TAX_DUTY', '税费关税', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_commission', NULL, 'SYSTEM', 'COMMISSION', 'COMMISSION', '佣金', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_procurement', NULL, 'SYSTEM', 'PROCUREMENT', 'PROCUREMENT', '采购附加', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('system_charge_other', NULL, 'SYSTEM', 'OTHER', 'OTHER', '其他费用', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

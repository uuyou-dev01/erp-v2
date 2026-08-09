-- One commission source may credit a user's wallet only once.
CREATE UNIQUE INDEX "earning_events_storeId_userId_sourceType_sourceId_earningType_key"
ON "earning_events"("storeId", "userId", "sourceType", "sourceId", "earningType");

-- Each earning event posts exactly one wallet credit.
CREATE UNIQUE INDEX "wallet_ledger_entries_earningEventId_key"
ON "wallet_ledger_entries"("earningEventId");

-- A withdrawal request can produce only one payout record.
CREATE UNIQUE INDEX "payout_records_withdrawalRequestId_key"
ON "payout_records"("withdrawalRequestId");

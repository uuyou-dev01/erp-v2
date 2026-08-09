-- A sales authorization must target exactly one account or reseller, and one
-- offer can only have one active record for the same target identity.
CREATE UNIQUE INDEX "supply_offer_channels_offerId_partnerId_key"
  ON "supply_offer_channels"("offerId", "partnerId");

ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_target_check"
  CHECK (num_nonnulls("salesChannelAccountId", "partnerId") = 1),
  ADD CONSTRAINT "supply_offer_channels_quota_check"
  CHECK (
    "quotaQty" >= 0 AND
    "quotaReservedQty" >= 0 AND
    "quotaReservedQty" <= "quotaQty"
  );

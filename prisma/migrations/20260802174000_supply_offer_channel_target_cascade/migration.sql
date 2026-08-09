-- Authorization rows cannot remain valid after their account/reseller target
-- disappears. Delete the authorization instead of nulling its only identity.
ALTER TABLE "supply_offer_channels"
  DROP CONSTRAINT "supply_offer_channels_salesChannelAccountId_fkey",
  DROP CONSTRAINT "supply_offer_channels_partnerId_fkey";

ALTER TABLE "supply_offer_channels"
  ADD CONSTRAINT "supply_offer_channels_salesChannelAccountId_fkey"
  FOREIGN KEY ("salesChannelAccountId") REFERENCES "sales_channel_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "supply_offer_channels_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "partners"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

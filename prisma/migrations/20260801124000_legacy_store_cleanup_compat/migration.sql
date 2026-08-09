-- Legacy tests and administrative cleanup delete Store before Organization.
-- Remove compatibility mirrors only when they are not protected by a service
-- agreement; collaboration history still keeps Restrict semantics.
CREATE OR REPLACE FUNCTION cleanup_unreferenced_store_mirrors() RETURNS trigger AS $$
BEGIN
  DELETE FROM "sales_channel_accounts" sca
  USING "platforms" p
  WHERE sca."legacyPlatformId" = p."id" AND p."storeId" = OLD."id";

  DELETE FROM "inventory_pools" ip
  WHERE ip."legacyStoreId" = OLD."id"
    AND NOT EXISTS (
      SELECT 1 FROM "service_agreements" sa WHERE sa."inventoryPoolId" = ip."id"
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "stores_cleanup_unreferenced_mirrors" ON "stores";
CREATE TRIGGER "stores_cleanup_unreferenced_mirrors"
BEFORE DELETE ON "stores"
FOR EACH ROW EXECUTE FUNCTION cleanup_unreferenced_store_mirrors();

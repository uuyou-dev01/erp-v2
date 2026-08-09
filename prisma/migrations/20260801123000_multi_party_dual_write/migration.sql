-- Compatibility dual-write layer. It keeps legacy Store/Platform writes aligned
-- with the new ownership scopes until the old columns are retired.

CREATE OR REPLACE FUNCTION sync_store_inventory_pool() RETURNS trigger AS $$
BEGIN
  IF NEW."organizationId" IS NOT NULL THEN
    INSERT INTO "inventory_pools" ("id", "organizationId", "legacyStoreId", "code", "name", "baseCurrency", "status", "createdAt", "updatedAt")
    VALUES ('auto_pool_' || md5(NEW."id"), NEW."organizationId", NEW."id", NEW."code", NEW."name", NEW."currency", 'ACTIVE', NEW."createdAt", CURRENT_TIMESTAMP)
    ON CONFLICT ("legacyStoreId") DO UPDATE SET
      "organizationId" = EXCLUDED."organizationId",
      "code" = EXCLUDED."code",
      "name" = EXCLUDED."name",
      "baseCurrency" = EXCLUDED."baseCurrency",
      "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "stores_inventory_pool_dual_write" ON "stores";
CREATE TRIGGER "stores_inventory_pool_dual_write"
AFTER INSERT OR UPDATE OF "organizationId", "code", "name", "currency" ON "stores"
FOR EACH ROW EXECUTE FUNCTION sync_store_inventory_pool();

CREATE OR REPLACE FUNCTION sync_platform_channel_account() RETURNS trigger AS $$
DECLARE
  target_org TEXT;
  store_code TEXT;
  store_currency TEXT;
  channel_id TEXT;
BEGIN
  SELECT "organizationId", "code", "currency" INTO target_org, store_code, store_currency
  FROM "stores" WHERE "id" = NEW."storeId";
  IF target_org IS NULL THEN RETURN NEW; END IF;
  channel_id := 'auto_channel_' || md5(NEW."id");
  INSERT INTO "sales_channel_accounts" (
    "id", "organizationId", "legacyPlatformId", "platformCode", "code", "name",
    "country", "defaultCurrency", "status", "createdAt", "updatedAt"
  ) VALUES (
    channel_id, target_org, NEW."id", NEW."code", store_code || '_' || NEW."code", NEW."name",
    NEW."country", COALESCE(NEW."defaultCurrency", store_currency), 'ACTIVE', NEW."createdAt", CURRENT_TIMESTAMP
  )
  ON CONFLICT ("legacyPlatformId") DO UPDATE SET
    "organizationId" = EXCLUDED."organizationId",
    "platformCode" = EXCLUDED."platformCode",
    "code" = EXCLUDED."code",
    "name" = EXCLUDED."name",
    "country" = EXCLUDED."country",
    "defaultCurrency" = EXCLUDED."defaultCurrency",
    "updatedAt" = CURRENT_TIMESTAMP
  RETURNING "id" INTO channel_id;

  INSERT INTO "channel_accesses" ("id", "salesChannelAccountId", "userId", "role", "permissions", "createdAt", "updatedAt")
  SELECT 'auto_channel_access_' || md5(channel_id || ':' || sa."userId"), channel_id, sa."userId", sa."role", sa."permissions", sa."createdAt", CURRENT_TIMESTAMP
  FROM "store_accesses" sa WHERE sa."storeId" = NEW."storeId"
  ON CONFLICT ("salesChannelAccountId", "userId") DO UPDATE SET
    "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "platforms_channel_dual_write" ON "platforms";
CREATE TRIGGER "platforms_channel_dual_write"
AFTER INSERT OR UPDATE OF "storeId", "code", "name", "country", "defaultCurrency" ON "platforms"
FOR EACH ROW EXECUTE FUNCTION sync_platform_channel_account();

CREATE OR REPLACE FUNCTION sync_store_access_scopes() RETURNS trigger AS $$
BEGIN
  INSERT INTO "inventory_pool_accesses" ("id", "inventoryPoolId", "userId", "role", "permissions", "createdAt", "updatedAt")
  SELECT 'auto_pool_access_' || md5(ip."id" || ':' || NEW."userId"), ip."id", NEW."userId", NEW."role", NEW."permissions", NEW."createdAt", CURRENT_TIMESTAMP
  FROM "inventory_pools" ip WHERE ip."legacyStoreId" = NEW."storeId"
  ON CONFLICT ("inventoryPoolId", "userId") DO UPDATE SET
    "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP;

  INSERT INTO "channel_accesses" ("id", "salesChannelAccountId", "userId", "role", "permissions", "createdAt", "updatedAt")
  SELECT 'auto_channel_access_' || md5(sca."id" || ':' || NEW."userId"), sca."id", NEW."userId", NEW."role", NEW."permissions", NEW."createdAt", CURRENT_TIMESTAMP
  FROM "sales_channel_accounts" sca JOIN "platforms" p ON p."id" = sca."legacyPlatformId"
  WHERE p."storeId" = NEW."storeId"
  ON CONFLICT ("salesChannelAccountId", "userId") DO UPDATE SET
    "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP;

  INSERT INTO "location_accesses" ("id", "locationId", "userId", "role", "permissions", "createdAt", "updatedAt")
  SELECT 'auto_location_access_' || md5(l."id" || ':' || NEW."userId"), l."id", NEW."userId", NEW."role", NEW."permissions", NEW."createdAt", CURRENT_TIMESTAMP
  FROM "locations" l WHERE l."storeId" = NEW."storeId"
  ON CONFLICT ("locationId", "userId") DO UPDATE SET
    "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "store_accesses_scope_dual_write" ON "store_accesses";
CREATE TRIGGER "store_accesses_scope_dual_write"
AFTER INSERT OR UPDATE OF "role", "permissions" ON "store_accesses"
FOR EACH ROW EXECUTE FUNCTION sync_store_access_scopes();

CREATE OR REPLACE FUNCTION sync_location_scope() RETURNS trigger AS $$
DECLARE target_org TEXT;
BEGIN
  IF NEW."operatorOrganizationId" IS NULL THEN
    SELECT "organizationId" INTO target_org FROM "stores" WHERE "id" = NEW."storeId";
    NEW."operatorOrganizationId" := target_org;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "locations_operator_dual_write" ON "locations";
CREATE TRIGGER "locations_operator_dual_write"
BEFORE INSERT OR UPDATE OF "storeId" ON "locations"
FOR EACH ROW EXECUTE FUNCTION sync_location_scope();

CREATE OR REPLACE FUNCTION sync_location_internal_access() RETURNS trigger AS $$
BEGIN
  INSERT INTO "location_accesses" ("id", "locationId", "userId", "role", "permissions", "createdAt", "updatedAt")
  SELECT 'auto_location_access_' || md5(NEW."id" || ':' || sa."userId"), NEW."id", sa."userId", sa."role", sa."permissions", sa."createdAt", CURRENT_TIMESTAMP
  FROM "store_accesses" sa WHERE sa."storeId" = NEW."storeId"
  ON CONFLICT ("locationId", "userId") DO UPDATE SET
    "role" = EXCLUDED."role", "permissions" = EXCLUDED."permissions", "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "locations_access_dual_write" ON "locations";
CREATE TRIGGER "locations_access_dual_write"
AFTER INSERT OR UPDATE OF "storeId" ON "locations"
FOR EACH ROW EXECUTE FUNCTION sync_location_internal_access();

CREATE OR REPLACE FUNCTION fill_inventory_pool_scope() RETURNS trigger AS $$
BEGIN
  IF NEW."inventoryPoolId" IS NULL THEN
    SELECT "id" INTO NEW."inventoryPoolId" FROM "inventory_pools" WHERE "legacyStoreId" = NEW."storeId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'skus', 'inventory_lots', 'item_units', 'stock_ledgers', 'opening_stocks',
    'inventory_splits', 'purchase_orders', 'inbound_shipments',
    'consolidation_batches', 'inspection_events', 'quick_entries'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_pool_dual_write', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "storeId" ON %I FOR EACH ROW EXECUTE FUNCTION fill_inventory_pool_scope()', table_name || '_pool_dual_write', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fill_supply_offer_scope() RETURNS trigger AS $$
BEGIN
  IF NEW."inventoryPoolId" IS NULL THEN
    SELECT "id", "organizationId" INTO NEW."inventoryPoolId", NEW."providerOrganizationId"
    FROM "inventory_pools" WHERE "legacyStoreId" = NEW."storeId";
  ELSIF NEW."providerOrganizationId" IS NULL THEN
    SELECT "organizationId" INTO NEW."providerOrganizationId" FROM "inventory_pools" WHERE "id" = NEW."inventoryPoolId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "supply_offers_scope_dual_write" ON "supply_offers";
CREATE TRIGGER "supply_offers_scope_dual_write"
BEFORE INSERT OR UPDATE OF "storeId" ON "supply_offers"
FOR EACH ROW EXECUTE FUNCTION fill_supply_offer_scope();

CREATE OR REPLACE FUNCTION fill_sales_channel_scope() RETURNS trigger AS $$
BEGIN
  IF NEW."salesChannelAccountId" IS NULL AND NEW."platformId" IS NOT NULL THEN
    SELECT "id" INTO NEW."salesChannelAccountId" FROM "sales_channel_accounts" WHERE "legacyPlatformId" = NEW."platformId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['listings', 'customer_orders'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', table_name || '_channel_dual_write', table_name);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF "platformId" ON %I FOR EACH ROW EXECUTE FUNCTION fill_sales_channel_scope()', table_name || '_channel_dual_write', table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION fill_resale_listing_scope() RETURNS trigger AS $$
BEGIN
  IF NEW."salesChannelAccountId" IS NULL AND NEW."platformId" IS NOT NULL THEN
    SELECT "id" INTO NEW."salesChannelAccountId" FROM "sales_channel_accounts" WHERE "legacyPlatformId" = NEW."platformId";
  END IF;
  IF NEW."sellerOrganizationId" IS NULL THEN
    SELECT "organizationId" INTO NEW."sellerOrganizationId" FROM "stores" WHERE "id" = NEW."storeId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "resale_listings_scope_dual_write" ON "resale_listings";
CREATE TRIGGER "resale_listings_scope_dual_write"
BEFORE INSERT OR UPDATE OF "storeId", "platformId" ON "resale_listings"
FOR EACH ROW EXECUTE FUNCTION fill_resale_listing_scope();

-- Separate physical inventory locations from the markets they can fulfill.
CREATE TABLE "location_capabilities" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_capabilities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shipping_lanes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT,
    "laneType" TEXT NOT NULL DEFAULT 'CUSTOMER_DELIVERY',
    "destinationCountry" TEXT,
    "serviceLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "carrier" TEXT,
    "minDays" INTEGER,
    "maxDays" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipping_lanes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipping_lanes_target_check" CHECK (
      ("laneType" = 'CUSTOMER_DELIVERY' AND "destinationCountry" IS NOT NULL AND "toLocationId" IS NULL)
      OR
      ("laneType" = 'WAREHOUSE_TRANSFER' AND "destinationCountry" IS NULL AND "toLocationId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "location_capabilities_locationId_code_key"
ON "location_capabilities"("locationId", "code");
CREATE INDEX "location_capabilities_locationId_enabled_idx"
ON "location_capabilities"("locationId", "enabled");

CREATE UNIQUE INDEX "shipping_lanes_fromLocationId_laneType_destinationCountry_toLocationId_serviceLevel_key"
ON "shipping_lanes"("fromLocationId", "laneType", "destinationCountry", "toLocationId", "serviceLevel");
CREATE INDEX "shipping_lanes_storeId_active_idx" ON "shipping_lanes"("storeId", "active");
CREATE INDEX "shipping_lanes_fromLocationId_active_idx" ON "shipping_lanes"("fromLocationId", "active");
CREATE INDEX "shipping_lanes_toLocationId_idx" ON "shipping_lanes"("toLocationId");

ALTER TABLE "location_capabilities"
ADD CONSTRAINT "location_capabilities_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shipping_lanes"
ADD CONSTRAINT "shipping_lanes_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_lanes"
ADD CONSTRAINT "shipping_lanes_fromLocationId_fkey"
FOREIGN KEY ("fromLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_lanes"
ADD CONSTRAINT "shipping_lanes_toLocationId_fkey"
FOREIGN KEY ("toLocationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Compatibility migration: derive operational capabilities from existing location behavior.
INSERT INTO "location_capabilities" ("id", "locationId", "code")
SELECT 'legacy-cap-' || substr(md5(l."id" || ':' || c."code"), 1, 22), l."id", c."code"
FROM "locations" l
CROSS JOIN (VALUES ('RECEIVE'), ('STORE'), ('TRANSFER')) AS c("code")
WHERE l."type" <> 'TRANSIT';

INSERT INTO "location_capabilities" ("id", "locationId", "code")
SELECT 'legacy-cap-' || substr(md5(l."id" || ':DIRECT_FULFILLMENT'), 1, 22), l."id", 'DIRECT_FULFILLMENT'
FROM "locations" l
WHERE l."isSellableDefault" = true;

INSERT INTO "location_capabilities" ("id", "locationId", "code")
SELECT 'legacy-cap-' || substr(md5(l."id" || ':INSPECT'), 1, 22), l."id", 'INSPECT'
FROM "locations" l
WHERE l."type" = 'WAREHOUSE';

INSERT INTO "location_capabilities" ("id", "locationId", "code")
SELECT 'legacy-cap-' || substr(md5(l."id" || ':CONSOLIDATE'), 1, 22), l."id", 'CONSOLIDATE'
FROM "locations" l
WHERE l."type" = 'FORWARDER';

INSERT INTO "location_capabilities" ("id", "locationId", "code")
SELECT 'legacy-cap-' || substr(md5(l."id" || ':RETURNS'), 1, 22), l."id", 'RETURNS'
FROM "locations" l
WHERE l."type" = 'WAREHOUSE';

-- Preserve the previous market behavior as one default delivery lane per sellable location.
INSERT INTO "shipping_lanes" (
  "id", "storeId", "fromLocationId", "laneType", "destinationCountry", "serviceLevel"
)
SELECT
  'legacy-lane-' || substr(md5(l."id" || ':' || m."country"), 1, 21),
  l."storeId",
  l."id",
  'CUSTOMER_DELIVERY',
  m."country",
  'STANDARD'
FROM "locations" l
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN upper(coalesce(l."region", '')) LIKE 'CN%' THEN 'CN'
    WHEN upper(coalesce(l."region", '')) LIKE 'JP%' THEN 'JP'
    WHEN upper(coalesce(l."region", '')) LIKE 'US%' THEN 'US'
    WHEN upper(coalesce(l."region", '')) LIKE 'EU%' THEN 'EU'
    ELSE NULL
  END AS "country"
) m
WHERE l."isSellableDefault" = true AND m."country" IS NOT NULL;

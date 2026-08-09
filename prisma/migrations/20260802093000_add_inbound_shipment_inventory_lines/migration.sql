CREATE TABLE "inbound_shipment_inventory_lines" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "destinationEntityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_TRANSIT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inbound_shipment_inventory_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inbound_shipment_inventory_lines_shipmentId_entityType_entityId_key"
ON "inbound_shipment_inventory_lines"("shipmentId", "entityType", "entityId");

CREATE INDEX "inbound_shipment_inventory_lines_shipmentId_status_idx"
ON "inbound_shipment_inventory_lines"("shipmentId", "status");

CREATE INDEX "inbound_shipment_inventory_lines_entityType_entityId_idx"
ON "inbound_shipment_inventory_lines"("entityType", "entityId");

ALTER TABLE "inbound_shipment_inventory_lines"
ADD CONSTRAINT "inbound_shipment_inventory_lines_shipmentId_fkey"
FOREIGN KEY ("shipmentId") REFERENCES "inbound_shipments"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

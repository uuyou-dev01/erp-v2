-- A purchase line represents one physical inbound quantity and must not be
-- assigned to more than one consolidation batch.
CREATE UNIQUE INDEX "consolidation_batch_lines_sourceType_sourceId_key"
ON "consolidation_batch_lines"("sourceType", "sourceId");

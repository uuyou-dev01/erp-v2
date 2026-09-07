import { notFound } from "next/navigation";
import { getConsolidationBatchById } from "@/app/actions/consolidations";
import { getLocations } from "@/app/actions/locations";
import { listTransferInventoryCandidates } from "@/app/actions/transfer-shipments";
import { ConsolidationBatchDetail } from "@/components/logistics/consolidation-batch-detail";

export const dynamic = "force-dynamic";

export default async function ConsolidationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const batch = await getConsolidationBatchById(id);
  if (!batch) notFound();
  const [locations, availableInventory] = await Promise.all([
    getLocations(batch.storeId),
    batch.fromLocationId
      ? listTransferInventoryCandidates({
          storeId: batch.storeId,
          locationId: batch.fromLocationId,
        })
      : Promise.resolve([]),
  ]);
  return (
    <ConsolidationBatchDetail
      batch={batch}
      availableInventory={availableInventory}
      locations={locations.map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
      }))}
    />
  );
}

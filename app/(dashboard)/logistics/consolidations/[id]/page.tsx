import { notFound } from "next/navigation";
import { getConsolidationBatchById } from "@/app/actions/consolidations";
import { getLocations } from "@/app/actions/locations";
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
  const locations = await getLocations(batch.storeId);
  return (
    <ConsolidationBatchDetail
      batch={batch}
      locations={locations.map((location) => ({
        id: location.id,
        code: location.code,
        name: location.name,
      }))}
    />
  );
}

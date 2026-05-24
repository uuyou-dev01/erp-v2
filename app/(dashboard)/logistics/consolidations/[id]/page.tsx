import { notFound } from "next/navigation";
import { getConsolidationBatchById } from "@/app/actions/consolidations";
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
  return <ConsolidationBatchDetail batch={batch} />;
}

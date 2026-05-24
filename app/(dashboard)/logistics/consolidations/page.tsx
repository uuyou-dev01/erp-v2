import { getConsolidationBatches } from "@/app/actions/consolidations";
import { ConsolidationBatchList } from "@/components/logistics/consolidation-batch-list";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STORE_ID = "store_1";

export default async function ConsolidationsPage() {
  const batches = await getConsolidationBatches(STORE_ID);
  return (
    <div>
      <PageHeader
        title="集运批次"
        description="管理合包、封箱、国际运输和到货确认。"
        badge={<Badge variant="secondary">{batches.length} 个批次</Badge>}
      />
      <ConsolidationBatchList batches={batches} />
    </div>
  );
}

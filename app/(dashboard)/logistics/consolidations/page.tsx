import { getConsolidationBatches } from "@/app/actions/consolidations";
import { ConsolidationBatchList } from "@/components/logistics/consolidation-batch-list";
import { ConsolidationBatchForm } from "@/components/logistics/consolidation-batch-form";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ConsolidationsPage() {
  const context = await requireUserContext();
  const [batches, locations] = await Promise.all([
    getConsolidationBatches(context.activeStoreId),
    prisma.location.findMany({
      where: { storeId: context.activeStoreId },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div>
      <PageHeader
        title="集运批次"
        description="按实际库存合包，管理封箱、发出确认和到货确认，不限制国内外方向。"
        badge={<Badge variant="secondary">{batches.length} 个批次</Badge>}
        actions={<ConsolidationBatchForm locations={locations} />}
      />
      <ConsolidationBatchList batches={batches} />
    </div>
  );
}

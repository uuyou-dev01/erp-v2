import { getMyRelationshipSummary } from "@/app/actions/relationships";
import { RelationshipOverview } from "@/components/collaboration/relationship-overview";

export const dynamic = "force-dynamic";

export default async function CollaborationRelationshipsPage() {
  const data = await getMyRelationshipSummary();
  const activeCount = data.relationships.filter(
    (relationship) => relationship.status === "ACTIVE"
  ).length;
  const pendingCount = data.relationships.reduce(
    (total, relationship) => total + relationship.pendingTaskCount,
    0
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <h1 className="text-3xl font-semibold tracking-tight">合作关系</h1>
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{activeCount}</p>
            <p className="text-muted-foreground">合作中</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums">{pendingCount}</p>
            <p className="text-muted-foreground">待处理任务</p>
          </div>
        </div>
      </section>
      <RelationshipOverview
        relationships={data.relationships}
        hasMembership={data.memberships.length > 0}
      />
    </div>
  );
}

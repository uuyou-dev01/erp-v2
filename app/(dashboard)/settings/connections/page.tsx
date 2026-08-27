import { Building2 } from "lucide-react";
import { getOrganizationConnectionsData } from "@/app/actions/organization-connections";
import { OrganizationConnectionsManager } from "@/components/settings/organization-connections-manager";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function OrganizationConnectionsPage() {
  const data = await getOrganizationConnectionsData();
  return (
    <div>
      <PageHeader
        title="企业连接"
        description="通过精确协作码发起请求；对方确认后，合作方才会关联到真实经营主体。"
        badge={<Building2 className="h-5 w-5 text-muted-foreground" />}
      />
      <OrganizationConnectionsManager
        currentOrganization={data.organization}
        currentRole={data.context.role}
        partners={data.partners}
        connections={data.connections.map((connection) => ({
          ...connection,
          createdAt: connection.createdAt.toISOString(),
          respondedAt: connection.respondedAt?.toISOString() ?? null,
          endedAt: connection.endedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}

import { SetupChecklist } from "@/components/setup/setup-checklist";
import { getSetupStatus, resolveSetupPath } from "@/lib/application/setup-status";
import { requireUserContext } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; welcome?: string }>;
}) {
  const context = await requireUserContext();
  const params = await searchParams;
  const status = await getSetupStatus({
    storeId: context.activeStoreId,
    role: context.role,
  });

  return (
    <SetupChecklist
      status={status}
      selectedPath={resolveSetupPath(params.path, status)}
      welcome={params.welcome === "1"}
    />
  );
}

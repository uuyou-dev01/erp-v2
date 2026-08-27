import { AuthShell } from "@/components/auth/auth-shell";
import { LocationFulfillerInvitationPanel } from "@/components/auth/location-fulfiller-invitation-panel";
import { getLocationFulfillerInvitationByToken } from "@/app/actions/location-fulfillers";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function WarehouseInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    getLocationFulfillerInvitationByToken(token),
    requireAuthenticatedUser().catch(() => null),
  ]);

  return (
    <AuthShell
      eyebrow="仓库发货邀请"
      title="协助朋友处理发货"
      description="你只会获得这个仓库的发货任务，不会加入对方企业，也看不到采购成本和其他仓库。"
    >
      {invitation ? (
        <LocationFulfillerInvitationPanel
          token={token}
          invitation={invitation}
          currentUserId={user?.id ?? null}
          currentEmail={user?.email ?? null}
        />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          邀请链接无效，请联系仓库管理员重新生成。
        </p>
      )}
    </AuthShell>
  );
}

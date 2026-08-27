import { AuthShell } from "@/components/auth/auth-shell";
import { TeamInvitationPanel } from "@/components/auth/team-invitation-panel";
import { getTeamInvitationByToken } from "@/app/actions/organization-invitations";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";

export const dynamic = "force-dynamic";

export default async function TeamInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    getTeamInvitationByToken(token),
    requireAuthenticatedUser().catch(() => null),
  ]);
  return (
    <AuthShell
      eyebrow="团队邀请"
      title="加入企业"
      description="确认企业、角色与店铺范围后，将这个个人账号加入团队。"
    >
      {invitation ? (
        <TeamInvitationPanel
          token={token}
          invitation={invitation}
          currentEmail={user?.email ?? null}
        />
      ) : (
        <p role="alert" className="text-sm text-destructive">
          邀请链接无效，请联系管理员重新生成。
        </p>
      )}
    </AuthShell>
  );
}

import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { OnboardingPanel } from "@/components/auth/onboarding-panel";
import { getOnboardingData } from "@/app/actions/organization-onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const data = await getOnboardingData().catch(() => redirect("/login?next=%2Fonboarding"));
  return (
    <AuthShell
      eyebrow="设置工作空间"
      title={`你好，${data.user.name || data.user.email}`}
      description="创建自己的企业空间，或接受管理员发来的团队邀请。"
    >
      <OnboardingPanel
        invitations={data.invitations}
        hasMembership={data.memberships.length > 0}
        hasWarehouseCollaboration={data.hasWarehouseCollaboration}
      />
    </AuthShell>
  );
}

import { LoginUserForm } from "@/components/auth/login-user-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { isSelfSignupEnabled } from "@/lib/auth/signup-policy";
import { getInvitedSignup } from "@/lib/auth/invited-signup";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/workbench";
  const invitedSignup = await getInvitedSignup(nextPath);
  return (
    <AuthShell
      eyebrow="欢迎回来"
      title="登录 ERP"
      description="使用你的个人账号登录；系统会根据成员身份进入对应企业。"
    >
      <LoginUserForm
        nextPath={nextPath}
        registrationEnabled={isSelfSignupEnabled() || Boolean(invitedSignup)}
      />
    </AuthShell>
  );
}

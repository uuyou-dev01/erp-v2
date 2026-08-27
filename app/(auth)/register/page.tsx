import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { isSelfSignupEnabled } from "@/lib/auth/signup-policy";
import { getInvitedSignup } from "@/lib/auth/invited-signup";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath =
    params.next?.startsWith("/") && !params.next.startsWith("//") ? params.next : "/onboarding";
  const registrationEnabled = isSelfSignupEnabled();
  const invitedSignup = await getInvitedSignup(nextPath);
  return (
    <AuthShell
      eyebrow="内部测试注册"
      title="创建个人账号"
      description="账号属于你本人；注册后再创建企业，或接受团队邀请加入已有企业。"
    >
      {registrationEnabled || invitedSignup ? (
        <RegisterForm nextPath={nextPath} fixedEmail={invitedSignup?.email} />
      ) : (
        <div className="space-y-4">
          <p role="alert" className="text-sm leading-6 text-muted-foreground">
            当前环境未开放自助注册。请联系企业管理员获取邀请，或使用已有账号登录。
          </p>
          <Link
            className="inline-flex text-sm font-medium text-primary hover:underline"
            href="/login"
          >
            返回登录
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

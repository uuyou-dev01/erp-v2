import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell
      eyebrow="账号安全"
      title="重置登录密码"
      description="重置链接只能使用一次；完成后所有旧登录状态都会失效。"
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}

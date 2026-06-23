import { getLoginUsers } from "@/app/actions/session";
import { LoginUserForm } from "@/components/auth/login-user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await getLoginUsers();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>选择操作人</CardTitle>
          <p className="text-sm text-muted-foreground">
            当前阶段用于多人流程测试；正式账号登录可以在这层基础上替换。
          </p>
        </CardHeader>
        <CardContent>
          <LoginUserForm users={users} />
        </CardContent>
      </Card>
    </main>
  );
}

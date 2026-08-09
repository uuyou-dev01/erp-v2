import { LoginUserForm } from "@/components/auth/login-user-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith("/") && !params.next.startsWith("//")
    ? params.next
    : "/workbench";
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 ERP</CardTitle>
          <p className="text-sm text-muted-foreground">
            使用已启用团队成员的邮箱和密码登录。
          </p>
        </CardHeader>
        <CardContent>
          <LoginUserForm nextPath={nextPath} />
        </CardContent>
      </Card>
    </main>
  );
}

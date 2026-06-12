import { getLoginUsers, switchCurrentUser } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "主体负责人",
  ADMIN: "管理员",
  MANAGER: "运营负责人",
  LISTING: "上架人员",
  FULFILLMENT: "打包/发货",
  FINANCE: "财务结算",
  VIEWER: "只读",
};

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
          <form action={switchCurrentUser} className="space-y-4">
            <Select name="email" required>
              <option value="">请选择成员</option>
              {users.map((user) => (
                <option key={user.id} value={user.email}>
                  {user.name} · {ROLE_LABELS[user.role] ?? user.role}
                </option>
              ))}
            </Select>
            <Button type="submit" className="w-full">
              进入工作台
            </Button>
          </form>
          {users.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              暂无可用成员，请先运行种子数据或创建团队成员。
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

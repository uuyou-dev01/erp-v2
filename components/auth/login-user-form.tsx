"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { switchCurrentUserAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface LoginUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface LoginUserFormProps {
  users: LoginUser[];
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "主体负责人",
  ADMIN: "管理员",
  MANAGER: "运营负责人",
  LISTING: "上架人员",
  FULFILLMENT: "打包/发货",
  FINANCE: "财务结算",
  VIEWER: "只读",
};

export function LoginUserForm({ users }: LoginUserFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loginError, setLoginError] = useState<string | null>(null);

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setLoginError(null);

    startTransition(() => {
      void (async () => {
        const result = await switchCurrentUserAction(new FormData(form));
        if (!result.success) {
          setLoginError(result.error);
          return;
        }

        router.push("/workbench");
        router.refresh();
      })();
    });
  };

  return (
    <>
      <form onSubmit={submitLogin} className="space-y-4">
        <Select name="email" required disabled={pending || users.length === 0}>
          <option value="">请选择成员</option>
          {users.map((user) => (
            <option key={user.id} value={user.email}>
              {user.name} · {ROLE_LABELS[user.role] ?? user.role}
            </option>
          ))}
        </Select>

        {loginError ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{loginError}</p>
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending || users.length === 0}>
          {pending ? "进入中..." : "进入工作台"}
        </Button>
      </form>

      {users.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          暂无可用成员，请先运行种子数据或创建团队成员。
        </p>
      ) : null}
    </>
  );
}

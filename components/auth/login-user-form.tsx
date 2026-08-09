"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { switchCurrentUserAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginUserForm({ nextPath = "/workbench" }: { nextPath?: string }) {
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

        const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/workbench";
        router.push(safeNextPath);
        router.refresh();
      })();
    });
  };

  return (
    <>
      <form onSubmit={submitLogin} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email">邮箱</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="login-password">密码</Label>
          <Input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            disabled={pending}
          />
        </div>

        {loginError ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{loginError}</p>
          </div>
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "登录中..." : "登录"}
        </Button>
      </form>
    </>
  );
}

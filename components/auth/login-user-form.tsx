"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { switchCurrentUserAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginUserForm({
  nextPath = "/workbench",
  registrationEnabled = true,
}: {
  nextPath?: string;
  registrationEnabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

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

        router.push(result.destination);
        router.refresh();
      })();
    });
  };

  return (
    <>
      <form onSubmit={submitLogin} className="space-y-5">
        <input type="hidden" name="next" value={nextPath} />
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
          <div className="relative">
            <Input
              id="login-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              minLength={8}
              disabled={pending}
              className="pr-11"
              onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
              onBlur={() => setCapsLock(false)}
            />
            <button
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {capsLock ? (
            <p role="status" className="text-xs text-amber-600">
              大写锁定已开启
            </p>
          ) : null}
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
      {registrationEnabled ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          还没有账号？{" "}
          <Link
            href={`/register?next=${encodeURIComponent(nextPath)}`}
            className="font-medium text-primary hover:underline"
          >
            注册内部测试账号
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          当前环境未开放自助注册，请联系企业管理员获取邀请。
        </p>
      )}
    </>
  );
}

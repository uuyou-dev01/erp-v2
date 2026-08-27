"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { registerAccountAction } from "@/app/actions/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm({
  nextPath = "/onboarding",
  fixedEmail,
}: {
  nextPath?: string;
  fixedEmail?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    startTransition(() => {
      void registerAccountAction(new FormData(form)).then((result) => {
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(result.destination);
        router.refresh();
      });
    });
  }

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        <input type="hidden" name="next" value={nextPath} />
        <div className="space-y-1.5">
          <Label htmlFor="register-name">姓名</Label>
          <Input
            id="register-name"
            name="name"
            autoComplete="name"
            maxLength={50}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-email">邮箱</Label>
          <Input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            defaultValue={fixedEmail}
            readOnly={Boolean(fixedEmail)}
          />
          <p className="text-xs text-muted-foreground">
            {fixedEmail
              ? "邀请只允许使用这个邮箱注册，以免仓库权限发给错误账号。"
              : "仅在管理员明确开放注册时可用；请使用本人长期持有的邮箱。"}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="register-password">密码</Label>
            <div className="relative">
              <Input
                id="register-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                required
                disabled={pending}
                className="pr-10"
                onKeyUp={(event) => setCapsLock(event.getModifierState("CapsLock"))}
                onBlur={() => setCapsLock(false)}
              />
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground"
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="register-confirm-password">确认密码</Label>
            <Input
              id="register-confirm-password"
              name="confirmPassword"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={pending}
            />
          </div>
        </div>
        {capsLock ? (
          <p role="status" className="text-xs text-amber-600">
            大写锁定已开启
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "正在创建账号..." : "创建账号"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        已有账号？{" "}
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="font-medium text-primary hover:underline"
        >
          返回登录
        </Link>
      </p>
    </>
  );
}

"use client";

import { FormEvent, useState, useTransition } from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { changeMyPasswordAction, updateMyProfileAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function ResultMessage({ error, success }: { error: string | null; success: string | null }) {
  if (!error && !success) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={
        error ? "text-sm text-destructive" : "flex items-center gap-1.5 text-sm text-emerald-600"
      }
    >
      {!error && <CheckCircle2 className="h-4 w-4" />}
      {error || success}
    </p>
  );
}

export function AccountSettingsForm({ name, email }: { name: string; email: string }) {
  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const submitProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setProfileError(null);
    setProfileSuccess(null);
    startProfileTransition(() => {
      void updateMyProfileAction(formData).then((result) => {
        if (!result.success) {
          setProfileError(result.error);
          return;
        }
        setProfileSuccess("个人资料已保存");
      });
    });
  };

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setPasswordError(null);
    setPasswordSuccess(null);
    startPasswordTransition(() => {
      void changeMyPasswordAction(formData).then((result) => {
        if (!result.success) {
          setPasswordError(result.error);
          return;
        }
        form.reset();
        setPasswordSuccess("密码已更新");
      });
    });
  };

  return (
    <div className="divide-y rounded-lg border bg-background">
      <section className="grid gap-6 p-5 md:grid-cols-[220px_1fr]">
        <div>
          <h2 className="text-sm font-medium">个人资料</h2>
          <p className="mt-1 text-sm text-muted-foreground">用于任务分配、操作记录和团队协作。</p>
        </div>
        <form onSubmit={submitProfile} className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">姓名</Label>
            <Input
              id="profile-name"
              name="name"
              defaultValue={name}
              maxLength={50}
              disabled={profilePending}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-email">登录邮箱</Label>
            <Input id="profile-email" value={email} disabled readOnly />
            <p className="text-xs text-muted-foreground">登录邮箱由企业管理员在团队成员中维护。</p>
          </div>
          <ResultMessage error={profileError} success={profileSuccess} />
          <Button type="submit" size="sm" disabled={profilePending}>
            {profilePending ? "保存中..." : "保存资料"}
          </Button>
        </form>
      </section>

      <section className="grid gap-6 p-5 md:grid-cols-[220px_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">账号安全</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">更新登录密码，保护账号和业务数据。</p>
        </div>
        <form onSubmit={submitPassword} className="max-w-md space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">当前密码</Label>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              disabled={passwordPending}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                disabled={passwordPending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">确认新密码</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                disabled={passwordPending}
                required
              />
            </div>
          </div>
          <ResultMessage error={passwordError} success={passwordSuccess} />
          <Button type="submit" size="sm" variant="outline" disabled={passwordPending}>
            {passwordPending ? "更新中..." : "更新密码"}
          </Button>
        </form>
      </section>
    </div>
  );
}

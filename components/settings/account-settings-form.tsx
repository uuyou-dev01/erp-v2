"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound, Pencil, ShieldCheck } from "lucide-react";
import { changeMyPasswordAction, updateMyProfileAction } from "@/app/actions/account";
import { ActionDialog } from "@/components/ui/action-dialog";
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
  const router = useRouter();
  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
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
        setProfileOpen(false);
        router.refresh();
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
        setPasswordOpen(false);
      });
    });
  };

  return (
    <>
      <div className="divide-y rounded-lg border bg-background">
        <section className="grid gap-5 p-5 md:grid-cols-[220px_1fr_auto] md:items-start">
          <div>
            <h2 className="text-sm font-medium">个人资料</h2>
            <p className="mt-1 text-sm text-muted-foreground">用于任务分配、操作记录和团队协作。</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">姓名</p>
              <p className="mt-1 text-sm font-medium">{name || "未填写"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">登录邮箱</p>
              <p className="mt-1 text-sm font-medium">{email}</p>
            </div>
            {profileSuccess ? (
              <div className="sm:col-span-2">
                <ResultMessage error={null} success={profileSuccess} />
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setProfileError(null);
              setProfileSuccess(null);
              setProfileOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            编辑资料
          </Button>
        </section>

        <section className="grid gap-5 p-5 md:grid-cols-[220px_1fr_auto] md:items-start">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">账号安全</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">更新登录密码，保护账号和业务数据。</p>
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">登录密码已设置</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">修改密码时需要先验证当前密码。</p>
            {passwordSuccess ? (
              <div className="mt-3">
                <ResultMessage error={null} success={passwordSuccess} />
              </div>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setPasswordError(null);
              setPasswordSuccess(null);
              setPasswordOpen(true);
            }}
          >
            <KeyRound className="h-4 w-4" />
            修改密码
          </Button>
        </section>
      </div>

      <ActionDialog
        open={profileOpen}
        onOpenChange={(nextOpen) => {
          setProfileOpen(nextOpen);
          if (!nextOpen) setProfileError(null);
        }}
        title="编辑个人资料"
        description="更新用于任务分配、操作记录和团队协作的个人信息。"
        size="sm"
        closeDisabled={profilePending}
      >
        {profileOpen ? (
          <form onSubmit={submitProfile} className="space-y-4">
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
              <p className="text-xs text-muted-foreground">
                登录邮箱由企业管理员在团队成员中维护。
              </p>
            </div>
            <ResultMessage error={profileError} success={null} />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={profilePending}
                onClick={() => setProfileOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={profilePending}>
                {profilePending ? "保存中..." : "保存资料"}
              </Button>
            </div>
          </form>
        ) : null}
      </ActionDialog>

      <ActionDialog
        open={passwordOpen}
        onOpenChange={(nextOpen) => {
          setPasswordOpen(nextOpen);
          if (!nextOpen) setPasswordError(null);
        }}
        title="修改登录密码"
        description="验证当前密码后设置新密码；新密码至少需要 8 个字符。"
        size="md"
        closeDisabled={passwordPending}
      >
        {passwordOpen ? (
          <form onSubmit={submitPassword} className="space-y-4">
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
            <ResultMessage error={passwordError} success={null} />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={passwordPending}
                onClick={() => setPasswordOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={passwordPending}>
                {passwordPending ? "更新中..." : "更新密码"}
              </Button>
            </div>
          </form>
        ) : null}
      </ActionDialog>
    </>
  );
}

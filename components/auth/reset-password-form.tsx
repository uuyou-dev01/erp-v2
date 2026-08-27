"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetPasswordWithTokenAction } from "@/app/actions/account-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    startTransition(() => {
      void resetPasswordWithTokenAction(data).then((result) => {
        if (!result.success) return setError(result.error);
        router.replace(result.destination);
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label htmlFor="reset-new-password">新密码</Label>
        <Input id="reset-new-password" name="newPassword" type="password" minLength={8} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reset-confirm-password">确认新密码</Label>
        <Input
          id="reset-confirm-password"
          name="confirmPassword"
          type="password"
          minLength={8}
          required
        />
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "正在重置..." : "重置密码"}
      </Button>
    </form>
  );
}

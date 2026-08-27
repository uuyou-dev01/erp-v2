"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { acceptTeamInvitationAction } from "@/app/actions/organization-invitations";
import { Button } from "@/components/ui/button";

export function TeamInvitationPanel({
  token,
  invitation,
  currentEmail,
}: {
  token: string;
  invitation: {
    email: string;
    role: string;
    status: string;
    organization: { name: string };
    storeScopes: Array<{ store: { name: string } }>;
  };
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acceptedDestination, setAcceptedDestination] = useState<string | null>(null);
  const nextPath = `/invite/team/${token}`;
  const canAccept = currentEmail === invitation.email && invitation.status === "PENDING";

  function accept() {
    setError(null);
    startTransition(() => {
      void acceptTeamInvitationAction(token).then((result) => {
        if (!result.success) return setError(result.error);
        const destination = "/workbench?welcome=1";
        setAcceptedDestination(destination);
        router.replace(destination);
        window.setTimeout(() => {
          const currentPath = `${window.location.pathname}${window.location.search}`;
          if (currentPath !== destination) window.location.assign(destination);
        }, 1800);
      });
    });
  }

  return (
    <div className="space-y-6">
      <div className="border-y py-5">
        <p className="text-xl font-semibold">{invitation.organization.name}</p>
        <p className="mt-2 text-sm text-muted-foreground">受邀邮箱：{invitation.email}</p>
        <p className="mt-1 text-sm text-muted-foreground">角色：{invitation.role}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          店铺：{invitation.storeScopes.map((scope) => scope.store.name).join("、")}
        </p>
      </div>
      {acceptedDestination ? (
        <div
          className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          <p className="font-medium">已加入企业，正在打开工作台…</p>
          <Link
            href={acceptedDestination}
            className="inline-flex font-medium underline underline-offset-4"
          >
            立即进入工作台
          </Link>
        </div>
      ) : invitation.status !== "PENDING" ? (
        <p role="alert" className="text-sm text-destructive">
          此邀请已失效或已被使用。
        </p>
      ) : null}
      {!currentEmail ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            登录后接受
          </Link>
          <Link
            href={`/register?next=${encodeURIComponent(nextPath)}`}
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium"
          >
            注册受邀账号
          </Link>
        </div>
      ) : currentEmail !== invitation.email ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            当前登录邮箱 {currentEmail} 与受邀邮箱不一致。
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            切换到受邀账号
          </Link>
        </div>
      ) : (
        <Button type="button" className="w-full" disabled={!canAccept || pending} onClick={accept}>
          <CheckCircle2 className="h-4 w-4" />
          {pending ? "正在加入..." : "确认加入企业"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground">
        内部测试阶段暂不验证邮箱。邀请只授予页面列出的企业角色和店铺权限。
      </p>
    </div>
  );
}

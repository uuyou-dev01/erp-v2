"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { acceptLocationFulfillerInvitationAction } from "@/app/actions/location-fulfillers";
import { Button } from "@/components/ui/button";
import {
  WAREHOUSE_ROLE_LABELS,
  type WarehouseFulfillerRole,
} from "@/lib/application/relationship-foundation";

export function LocationFulfillerInvitationPanel({
  token,
  invitation,
  currentUserId,
  currentEmail,
}: {
  token: string;
  invitation: {
    email: string;
    userId: string | null;
    role: string;
    status: string;
    isDefault: boolean;
    acceptedAt: Date | null;
    organization: { name: string };
    location: { name: string; code: string; region: string | null };
    invitedBy: { name: string | null; email: string };
  };
  currentUserId: string | null;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [acceptedDestination, setAcceptedDestination] = useState<string | null>(null);
  const nextPath = `/invite/warehouse/${token}`;
  const accountMatches =
    invitation.status === "ACTIVE"
      ? currentUserId === invitation.userId
      : currentEmail?.toLowerCase() === invitation.email.toLowerCase();
  const canAccept = accountMatches && invitation.status === "INVITED";
  const destination = "/collaboration/tasks";

  function accept() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await acceptLocationFulfillerInvitationAction(token);
        if (!result.success) {
          setError(result.error);
          return;
        }
        setAcceptedDestination(destination);
        router.replace(destination);
        window.setTimeout(() => {
          const currentPath = `${window.location.pathname}${window.location.search}`;
          if (currentPath !== destination) window.location.assign(destination);
        }, 1800);
      } catch (error) {
        setError(error instanceof Error ? error.message : "接受任务邀请失败，请重试");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="border-y py-5">
        <p className="text-xl font-semibold">{invitation.location.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {invitation.organization.name} · {invitation.location.code}
          {invitation.location.region ? ` · ${invitation.location.region}` : ""}
        </p>
        <p className="mt-4 text-sm">受邀邮箱：{invitation.email}</p>
        <p className="mt-1 text-sm">
          身份：
          {WAREHOUSE_ROLE_LABELS[invitation.role as WarehouseFulfillerRole] ?? invitation.role}
          {invitation.isDefault ? "（默认负责人）" : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          邀请人：{invitation.invitedBy.name || invitation.invitedBy.email}
        </p>
      </div>

      <div className="flex gap-2 rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          接受后会建立长期的外部任务协作关系，之后的新任务仍会进入“我的协作”。当前协作范围是这个仓库，但关系并不限定为发货，也不会让你加入对方企业或开放其他业务数据。
        </p>
      </div>

      {acceptedDestination ? (
        <div
          className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          <p className="font-medium">邀请已接受，正在打开你的任务…</p>
          <p className="text-xs leading-5 text-emerald-800">
            如果页面没有自动跳转，可以使用下面的入口继续。
          </p>
          <Link
            href={acceptedDestination}
            className="inline-flex font-medium underline underline-offset-4"
          >
            立即进入我的任务
          </Link>
        </div>
      ) : invitation.status === "ACTIVE" ? (
        <div
          className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          role="status"
        >
          <p className="font-medium">此邀请已接受</p>
          <p className="text-xs leading-5 text-emerald-800">
            当前任务协作范围已经添加到受邀账号，重复打开链接不会重复创建身份或授权。
          </p>
          {accountMatches ? (
            <Link
              href={destination}
              className="inline-flex font-medium underline underline-offset-4"
            >
              进入我的任务
            </Link>
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(destination)}`}
              className="inline-flex font-medium underline underline-offset-4"
            >
              {currentEmail ? "切换到受邀账号" : "登录受邀账号"}
            </Link>
          )}
        </div>
      ) : invitation.status === "EXPIRED" ? (
        <div className="space-y-1" role="alert">
          <p className="text-sm font-medium text-destructive">邀请已过期</p>
          <p className="text-xs leading-5 text-muted-foreground">
            此链接已超过有效期，请联系邀请方重新生成邀请。
          </p>
        </div>
      ) : invitation.status === "SUSPENDED" ? (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium">任务协作已暂停</p>
          <p className="text-xs leading-5 text-muted-foreground">
            这条协作关系目前不可用，如需恢复请联系邀请方。
          </p>
        </div>
      ) : invitation.status === "ENDED" ? (
        <div className="space-y-1" role="status">
          <p className="text-sm font-medium">任务协作已结束</p>
          <p className="text-xs leading-5 text-muted-foreground">
            历史任务记录仍会保留；重新合作需要邀请方发送新邀请。
          </p>
        </div>
      ) : invitation.status !== "INVITED" ? (
        <p role="alert" className="text-sm text-destructive">
          此邀请已失效，请联系邀请方重新生成。
        </p>
      ) : !currentEmail ? (
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
            注册个人账号
          </Link>
        </div>
      ) : !accountMatches ? (
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
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? "正在接受..." : "接受并进入我的任务"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

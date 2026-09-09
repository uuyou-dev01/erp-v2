"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Users } from "lucide-react";
import { createOrganizationAction } from "@/app/actions/organization-onboarding";
import { acceptTeamInvitationByIdAction } from "@/app/actions/organization-invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Invitation = {
  id: string;
  role: string;
  expiresAt: Date;
  organization: { id: string; name: string };
  storeScopes: Array<{ store: { name: string } }>;
};

export function OnboardingPanel({
  invitations,
  hasMembership,
  hasWarehouseCollaboration,
}: {
  invitations: Invitation[];
  hasMembership: boolean;
  hasWarehouseCollaboration: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"choose" | "create">(invitations.length ? "choose" : "create");

  function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    startTransition(() => {
      void createOrganizationAction(new FormData(form)).then((result) => {
        if (!result.success) return setError(result.error);
        router.push("/setup?welcome=1");
        router.refresh();
      });
    });
  }

  function accept(invitationId: string) {
    setError(null);
    startTransition(() => {
      void acceptTeamInvitationByIdAction(invitationId).then((result) => {
        if (!result.success) return setError(result.error);
        router.push("/workbench");
        router.refresh();
      });
    });
  }

  if (mode === "choose") {
    return (
      <div className="space-y-6">
        {invitations.length ? (
          <section className="divide-y border-y">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="grid gap-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    <Users className="h-4 w-4 text-primary" />
                    {invitation.organization.name}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    角色 {invitation.role} ·{" "}
                    {invitation.storeScopes.map((scope) => scope.store.name).join("、")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => accept(invitation.id)}
                >
                  接受邀请
                </Button>
              </div>
            ))}
          </section>
        ) : (
          <p className="text-sm text-muted-foreground">当前邮箱没有待处理邀请。</p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="border-t pt-5">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={() => setMode("create")}
          >
            <Building2 className="h-4 w-4" />
            创建新的企业空间
          </Button>
        </div>
        {hasMembership ? (
          <Link
            href="/workbench"
            className="block text-center text-sm text-primary hover:underline"
          >
            返回当前企业工作台
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={createOrganization} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="organization-name">企业或团队名称</Label>
        <Input
          id="organization-name"
          name="name"
          maxLength={80}
          required
          disabled={pending}
          placeholder="例如：东京跨境选品团队"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="store-name">第一个店铺名称</Label>
        <Input
          id="store-name"
          name="storeName"
          maxLength={80}
          required
          disabled={pending}
          placeholder="例如：主店"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="currency">默认币种</Label>
        <Select id="currency" name="currency" defaultValue="CNY" disabled={pending}>
          <option value="CNY">人民币 CNY</option>
          <option value="JPY">日元 JPY</option>
          <option value="USD">美元 USD</option>
        </Select>
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        创建后你会成为企业所有者；企业协作码由系统自动生成。
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "正在初始化..." : "创建企业并开始配置"}
      </Button>
      {invitations.length ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("choose")}>
          返回待处理邀请
        </Button>
      ) : null}
      {hasWarehouseCollaboration ? (
        <Link
          href="/collaboration"
          className="block text-center text-sm text-primary hover:underline"
        >
          暂不创建，返回我的外部协作
        </Link>
      ) : null}
    </form>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check } from "lucide-react";
import { switchActiveOrganizationAction } from "@/app/actions/session";
import { leaveOrganizationAction } from "@/app/actions/organization-membership";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "所有者",
  ADMIN: "管理员",
  MANAGER: "运营负责人",
  LISTING: "上架人员",
  FULFILLMENT: "打包/发货",
  FINANCE: "财务结算",
  VIEWER: "只读",
};

export function MyOrganizations({
  organizations,
  activeOrganizationId,
}: {
  organizations: Array<{ id: string; name: string; collaborationCode: string; role: string }>;
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function activate(id: string) {
    setError(null);
    startTransition(() => {
      void switchActiveOrganizationAction(id).then((result) => {
        if (!result.success) return setError(result.error);
        router.refresh();
      });
    });
  }
  function leave(id: string, name: string) {
    if (!window.confirm(`确认退出「${name}」吗？退出后将失去该企业的店铺与业务权限。`)) return;
    setError(null);
    startTransition(() => {
      void leaveOrganizationAction(id).then((result) => {
        if (!result.success) return setError(result.error);
        router.push(result.destination);
        router.refresh();
      });
    });
  }
  return (
    <section className="grid gap-6 border-t py-6 md:grid-cols-[220px_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">我的企业</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">查看成员身份并切换当前经营主体。</p>
      </div>
      <div className="max-w-2xl divide-y border-y">
        {organizations.map((organization) => {
          const active = organization.id === activeOrganizationId;
          return (
            <div
              key={organization.id}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <span>{organization.name}</span>
                  {active ? (
                    <Badge variant="secondary">
                      <Check className="mr-1 h-3 w-3" />
                      当前
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ROLE_LABELS[organization.role] ?? organization.role} ·{" "}
                  {organization.collaborationCode}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {active ? (
                  <span className="text-xs text-muted-foreground">正在使用</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => activate(organization.id)}
                  >
                    切换到此企业
                  </Button>
                )}
                {organization.role === "OWNER" ? (
                  <span className="text-xs text-muted-foreground">转移所有权后可退出</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => leave(organization.id, organization.name)}
                  >
                    退出企业
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        <div className="py-4">
          <Link href="/onboarding" className="text-sm font-medium text-primary hover:underline">
            创建另一个企业空间
          </Link>
        </div>
        {error ? (
          <p role="alert" className="pb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

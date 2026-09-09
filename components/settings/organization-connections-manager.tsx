"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, Check, Link2, Plus, Search, Unlink, X } from "lucide-react";
import {
  endOrganizationConnectionAction,
  findOrganizationByCollaborationCodeAction,
  requestOrganizationConnectionAction,
  respondOrganizationConnectionAction,
} from "@/app/actions/organization-connections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ActionDialog } from "@/components/ui/action-dialog";

type OrganizationSummary = { id: string; name: string; collaborationCode: string };
type ConnectionRow = {
  id: string;
  status: string;
  requesterOrganizationId: string;
  targetOrganizationId: string;
  createdAt: string;
  respondedAt: string | null;
  endedAt: string | null;
  requesterOrganization: OrganizationSummary;
  targetOrganization: OrganizationSummary;
  initiatingPartner: { id: string; name: string; type: string } | null;
  requestedBy: { name: string | null; email: string };
  respondedBy: { name: string | null; email: string } | null;
  events: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: string;
    actorUser: { name: string | null; email: string };
  }>;
};

const EVENT_LABELS: Record<string, string> = {
  IMPORTED: "导入历史状态",
  REQUESTED: "发起连接",
  REOPENED: "重新发起",
  ACCEPTED: "接受连接",
  REJECTED: "拒绝连接",
  ENDED: "解除连接",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "等待确认",
  ACTIVE: "已连接",
  REJECTED: "已拒绝",
  ENDED: "已解除",
};

export function OrganizationConnectionsManager({
  currentOrganization,
  currentRole,
  connections,
  partners,
}: {
  currentOrganization: OrganizationSummary;
  currentRole: string;
  connections: ConnectionRow[];
  partners: Array<{ id: string; name: string; code: string; organizationId: string | null }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [preview, setPreview] = useState<OrganizationSummary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"received" | "sent" | "active" | "history">("received");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const isAdmin = currentRole === "OWNER" || currentRole === "ADMIN";
  const availablePartners = partners.filter((partner) => !partner.organizationId);
  const visible = useMemo(
    () =>
      connections.filter((connection) => {
        if (tab === "received")
          return (
            connection.status === "PENDING" &&
            connection.targetOrganizationId === currentOrganization.id
          );
        if (tab === "sent")
          return (
            connection.status === "PENDING" &&
            connection.requesterOrganizationId === currentOrganization.id
          );
        if (tab === "active") return connection.status === "ACTIVE";
        return connection.status === "REJECTED" || connection.status === "ENDED";
      }),
    [connections, currentOrganization.id, tab]
  );

  function lookup() {
    setError(null);
    setMessage(null);
    setPreview(null);
    startTransition(() => {
      void findOrganizationByCollaborationCodeAction(code).then((result) => {
        if (!result.success) return setError(result.error);
        setPreview(result.organization);
      });
    });
  }

  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview) return setError("请先查找并确认目标企业");
    setError(null);
    setMessage(null);
    startTransition(() => {
      void requestOrganizationConnectionAction({
        partnerId,
        collaborationCode: preview.collaborationCode,
      }).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage(`已向 ${result.targetName} 发出连接请求`);
        setPreview(null);
        setCode("");
        setPartnerId("");
        setTab("sent");
        setConnectionDialogOpen(false);
        router.refresh();
      });
    });
  }

  function respond(connectionId: string, decision: "ACCEPT" | "REJECT") {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void respondOrganizationConnectionAction({ connectionId, decision }).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage(decision === "ACCEPT" ? "企业连接已建立" : "连接请求已拒绝");
        router.refresh();
      });
    });
  }

  function end(connectionId: string) {
    setError(null);
    setMessage(null);
    startTransition(() => {
      void endOrganizationConnectionAction(connectionId).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage("企业连接已解除，历史业务记录不受影响");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-semibold">企业连接</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            先处理已有请求和连接；需要新增时再发起连接。
          </p>
        </div>
        {isAdmin ? (
          <div className="text-right">
            <Button
              type="button"
              onClick={() => {
                setError(null);
                setConnectionDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              发起连接
            </Button>
          </div>
        ) : null}
      </div>

      <ActionDialog
        open={connectionDialogOpen}
        onOpenChange={(nextOpen) => {
          setConnectionDialogOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
        title="发起企业连接"
        description="使用对方的企业协作码确认身份；关联本地合作方档案是可选的。"
        size="md"
        closeDisabled={pending}
      >
        <form onSubmit={request} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="connection-partner">关联本地合作方（可选）</Label>
            <Select
              id="connection-partner"
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
            >
              <option value="">暂不关联合作方档案</option>
              {availablePartners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name} · {partner.code}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="collaboration-code">对方企业协作码</Label>
            <div className="flex gap-2">
              <Input
                id="collaboration-code"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setPreview(null);
                }}
                placeholder="ORG-7K4P9M"
                required
              />
              <Button type="button" variant="outline" disabled={pending} onClick={lookup}>
                <Search className="h-4 w-4" />
                查找
              </Button>
            </div>
          </div>
          {preview ? (
            <div
              role="status"
              className="flex items-center gap-3 rounded-md border border-primary/30 bg-muted/20 px-3 py-2"
            >
              <Building2 className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">{preview.name}</p>
                <p className="text-xs text-muted-foreground">{preview.collaborationCode}</p>
              </div>
              <Badge variant="secondary">已精确匹配</Badge>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConnectionDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending || !preview}>
              <Link2 className="h-4 w-4" />
              发送连接请求
            </Button>
          </div>
        </form>
      </ActionDialog>

      <div className="flex gap-1 overflow-x-auto border-b" role="tablist">
        {(
          [
            ["received", "收到的请求"],
            ["sent", "发出的请求"],
            ["active", "已连接企业"],
            ["history", "历史记录"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm ${tab === value ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {error && !connectionDialogOpen ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="divide-y border-y">
        {visible.map((connection) => {
          const incoming = connection.targetOrganizationId === currentOrganization.id;
          const other = incoming ? connection.requesterOrganization : connection.targetOrganization;
          return (
            <div
              key={connection.id}
              className="grid gap-4 py-5 lg:grid-cols-[1fr_auto] lg:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{currentOrganization.name}</span>
                  <ArrowRight
                    className={`h-4 w-4 text-muted-foreground ${incoming ? "rotate-180" : ""}`}
                  />
                  <span className="font-medium">{other.name}</span>
                  <Badge variant={connection.status === "ACTIVE" ? "default" : "outline"}>
                    {STATUS_LABELS[connection.status] ?? connection.status}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {connection.initiatingPartner
                    ? `合作方：${connection.initiatingPartner.name}`
                    : "未关联合作方"}{" "}
                  · 发起人 {connection.requestedBy.name || connection.requestedBy.email}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {other.collaborationCode} ·{" "}
                  {new Date(connection.createdAt).toLocaleString("zh-CN")}
                </p>
                {tab === "history" && connection.events.length ? (
                  <ol className="mt-3 space-y-1 border-l pl-3 text-xs text-muted-foreground">
                    {connection.events.map((event) => (
                      <li key={event.id}>
                        <span className="font-medium text-foreground">
                          {EVENT_LABELS[event.eventType] ?? event.eventType}
                        </span>{" "}
                        · {event.actorUser.name || event.actorUser.email} ·{" "}
                        {new Date(event.createdAt).toLocaleString("zh-CN")}
                        {event.reason ? ` · ${event.reason}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </div>
              <div className="flex justify-end gap-2">
                {tab === "received" && isAdmin ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => respond(connection.id, "ACCEPT")}
                    >
                      <Check className="h-4 w-4" />
                      接受
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => respond(connection.id, "REJECT")}
                    >
                      <X className="h-4 w-4" />
                      拒绝
                    </Button>
                  </>
                ) : null}
                {tab === "active" && isAdmin ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={pending}
                    onClick={() => end(connection.id)}
                  >
                    <Unlink className="h-4 w-4" />
                    解除连接
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
        {!visible.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            当前没有相关企业连接。
          </div>
        ) : null}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        企业连接只确认双方身份，不会自动共享库存、成本、订单或资金数据；具体业务仍需货盘授权或服务协议。
      </p>
    </div>
  );
}

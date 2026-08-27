"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, RefreshCw, Settings2, UserPlus, X } from "lucide-react";
import { deactivateTeamMemberAction, updateTeamMemberAccessAction } from "@/app/actions/team";
import { transferOrganizationOwnershipAction } from "@/app/actions/organization-membership";
import {
  createTeamInvitationAction,
  regenerateTeamInvitationAction,
  revokeTeamInvitationAction,
} from "@/app/actions/organization-invitations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { canShipOrders } from "@/lib/auth/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StoreOption {
  id: string;
  name: string;
  code: string;
}
interface LocationOption {
  id: string;
  storeId: string;
  name: string;
  code: string;
}
interface TeamMemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string | null;
  storeAccesses: Array<{ storeId: string; role: string }>;
  shipLocationIds: string[];
}
interface InvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
  storeIds: string[];
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "所有者",
  ADMIN: "管理员",
  MANAGER: "运营负责人",
  LISTING: "上架人员",
  FULFILLMENT: "打包/发货",
  FINANCE: "财务结算",
  VIEWER: "只读",
};
const INVITATION_LABELS: Record<string, string> = {
  PENDING: "等待接受",
  ACCEPTED: "已接受",
  REVOKED: "已撤销",
  EXPIRED: "已过期",
};

function namesForStores(stores: StoreOption[], storeIds: string[]) {
  const names = new Map(stores.map((store) => [store.id, store.name]));
  return (
    storeIds
      .map((id) => names.get(id))
      .filter(Boolean)
      .join("、") || "未授权店铺"
  );
}

export function TeamMemberTable({
  stores,
  locations,
  roles,
  members,
  invitations,
  currentUserId,
  currentUserRole,
  defaultInviteOpen = false,
}: {
  stores: StoreOption[];
  locations: LocationOption[];
  roles: readonly string[];
  members: TeamMemberRow[];
  invitations: InvitationRow[];
  currentUserId: string;
  currentUserRole: string;
  defaultInviteOpen?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"members" | "invitations">("members");
  const [inviteOpen, setInviteOpen] = useState(defaultInviteOpen);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState("");
  const [editingStoreIds, setEditingStoreIds] = useState<string[]>([]);
  const [editingShipLocationIds, setEditingShipLocationIds] = useState<string[]>([]);
  const pendingInvitationCount = useMemo(
    () => invitations.filter((item) => item.status === "PENDING").length,
    [invitations]
  );
  const availableRoles =
    currentUserRole === "OWNER" || currentUserRole === "ADMIN"
      ? roles
      : roles.filter((role) => !["ADMIN", "MANAGER"].includes(role));
  const editingMember = members.find((member) => member.id === editingMemberId) ?? null;
  const editingLocations = locations.filter((location) =>
    editingStoreIds.includes(location.storeId)
  );

  function beginEditing(member: TeamMemberRow) {
    setEditingMemberId(member.id);
    setEditingRole(member.role);
    setEditingStoreIds(member.storeAccesses.map((access) => access.storeId));
    setEditingShipLocationIds(member.shipLocationIds);
    setError(null);
    setMessage(null);
  }

  function fullLink(path: string) {
    return `${window.location.origin}${path}`;
  }

  async function copyLink(path: string) {
    await navigator.clipboard.writeText(fullLink(path));
    setMessage("邀请链接已复制");
  }

  function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setMessage(null);
    setLatestLink(null);
    startTransition(() => {
      void createTeamInvitationAction(new FormData(form)).then((result) => {
        if (!result.success) return setError(result.error);
        const link = fullLink(result.invitationPath);
        setLatestLink(link);
        setMessage("邀请已创建，请复制链接发给同事");
        form.reset();
        router.refresh();
      });
    });
  }

  function invitationAction(action: "revoke" | "regenerate", invitationId: string) {
    const data = new FormData();
    data.set("invitationId", invitationId);
    setError(null);
    setMessage(null);
    setLatestLink(null);
    startTransition(() => {
      const task =
        action === "revoke"
          ? revokeTeamInvitationAction(data)
          : regenerateTeamInvitationAction(data);
      void task.then((result) => {
        if (!result.success) return setError(result.error);
        if ("invitationPath" in result) {
          setLatestLink(fullLink(result.invitationPath));
          setMessage("新链接已生成，旧链接立即失效");
        } else setMessage("邀请已撤销");
        router.refresh();
      });
    });
  }

  function deactivate(userId: string) {
    const data = new FormData();
    data.set("userId", userId);
    setError(null);
    setMessage(null);
    startTransition(() => {
      void deactivateTeamMemberAction(data).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage("成员已停用");
        router.refresh();
      });
    });
  }

  function submitMemberAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(null);
    setMessage(null);
    startTransition(() => {
      void updateTeamMemberAccessAction(new FormData(form)).then((result) => {
        if (!result.success) return setError(result.error);
        setEditingMemberId(null);
        setMessage("成员权限已更新，后续操作将按最新授权实时校验");
        router.refresh();
      });
    });
  }

  function transferOwnership(userId: string, memberName: string) {
    if (!window.confirm(`确认把企业所有权转移给「${memberName}」吗？你将变为管理员。`)) return;
    setError(null);
    setMessage(null);
    startTransition(() => {
      void transferOrganizationOwnershipAction(userId).then((result) => {
        if (!result.success) return setError(result.error);
        setMessage("企业所有权已转移");
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="团队管理">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "members"}
            className={`rounded-md px-3 py-2 text-sm ${activeTab === "members" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => setActiveTab("members")}
          >
            成员 {members.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "invitations"}
            className={`rounded-md px-3 py-2 text-sm ${activeTab === "invitations" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            onClick={() => setActiveTab("invitations")}
          >
            待处理邀请 {pendingInvitationCount}
          </button>
        </div>
        <Button type="button" onClick={() => setInviteOpen((value) => !value)}>
          <UserPlus className="h-4 w-4" />
          邀请成员
        </Button>
      </div>

      {inviteOpen ? (
        <form
          onSubmit={submitInvitation}
          className="grid gap-4 border-b bg-muted/20 pb-5 pt-1 md:grid-cols-[1.2fr_0.8fr_1.4fr_auto] md:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">成员邮箱</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="name@example.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">角色</Label>
            <Select id="invite-role" name="role" defaultValue="FULFILLMENT">
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role] ?? role}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">可访问店铺</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-md border bg-background px-3">
              {stores.map((store, index) => (
                <label key={store.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="storeIds"
                    value={store.id}
                    defaultChecked={index === 0}
                  />
                  {store.name}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending}>
            {pending ? "生成中..." : "生成链接"}
          </Button>
          <p className="text-xs text-muted-foreground md:col-span-4">
            角色和店铺是初始授权；成员加入后可随时在成员列表中修改，发货始终按当前权限校验。
          </p>
        </form>
      ) : null}

      {latestLink ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center"
        >
          <Link2 className="h-4 w-4 shrink-0 text-primary" />
          <code className="min-w-0 flex-1 break-all text-xs">{latestLink}</code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => copyLink(latestLink.replace(window.location.origin, ""))}
          >
            <Copy className="h-4 w-4" />
            复制链接
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="flex items-center gap-2 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {editingMember ? (
        <form
          onSubmit={submitMemberAccess}
          className="grid gap-4 border-y bg-muted/20 py-4 md:grid-cols-2 xl:grid-cols-[1fr_0.7fr_1.2fr_1.4fr_auto] xl:items-end"
        >
          <input type="hidden" name="userId" value={editingMember.id} />
          <div>
            <p className="text-sm font-medium">修改 {editingMember.name || editingMember.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              保存后会立即撤销不再适用的店铺、仓库和待办权限。
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`member-role-${editingMember.id}`}>角色</Label>
            <Select
              id={`member-role-${editingMember.id}`}
              name="role"
              value={editingRole}
              onChange={(event) => setEditingRole(event.target.value)}
            >
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role] ?? role}
                </option>
              ))}
            </Select>
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">可访问店铺</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-md border bg-background px-3">
              {stores.map((store) => (
                <label key={store.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="storeIds"
                    value={store.id}
                    checked={editingStoreIds.includes(store.id)}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setEditingStoreIds((current) => [...current, store.id]);
                      } else {
                        setEditingStoreIds((current) => current.filter((id) => id !== store.id));
                        const locationIds = new Set(
                          locations
                            .filter((location) => location.storeId === store.id)
                            .map((location) => location.id)
                        );
                        setEditingShipLocationIds((current) =>
                          current.filter((id) => !locationIds.has(id))
                        );
                      }
                    }}
                  />
                  {store.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5" disabled={!canShipOrders(editingRole)}>
            <legend className="text-sm font-medium">可发货仓库</legend>
            <div className="flex min-h-10 flex-wrap items-center gap-3 rounded-md border bg-background px-3 py-2 disabled:opacity-50">
              {!canShipOrders(editingRole) ? (
                <span className="text-xs text-muted-foreground">当前角色不能发货</span>
              ) : editingLocations.length ? (
                editingLocations.map((location) => (
                  <label key={location.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="shipLocationIds"
                      value={location.id}
                      checked={editingShipLocationIds.includes(location.id)}
                      onChange={(event) =>
                        setEditingShipLocationIds((current) =>
                          event.target.checked
                            ? [...current, location.id]
                            : current.filter((id) => id !== location.id)
                        )
                      }
                    />
                    {location.name}
                  </label>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">所选店铺还没有仓库</span>
              )}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setEditingMemberId(null)}
            >
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "保存中..." : "保存权限"}
            </Button>
          </div>
        </form>
      ) : null}

      {activeTab === "members" ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>成员</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>店铺权限</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="font-medium">{member.name || member.email}</div>
                  <div className="text-xs text-muted-foreground">{member.email}</div>
                </TableCell>
                <TableCell>{ROLE_LABELS[member.role] ?? member.role}</TableCell>
                <TableCell className="max-w-[280px] text-muted-foreground">
                  {namesForStores(
                    stores,
                    member.storeAccesses.map((access) => access.storeId)
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>
                    {member.status === "ACTIVE" ? "启用" : "停用"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {member.id !== currentUserId && member.status === "ACTIVE" ? (
                    <span className="inline-flex gap-1">
                      {member.role !== "OWNER" &&
                      (currentUserRole === "OWNER" ||
                        currentUserRole === "ADMIN" ||
                        !["ADMIN", "MANAGER"].includes(member.role)) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => beginEditing(member)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          权限
                        </Button>
                      ) : null}
                      {currentUserRole === "OWNER" && member.role !== "OWNER" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => transferOwnership(member.id, member.name || member.email)}
                        >
                          转为所有者
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => deactivate(member.id)}
                      >
                        停用
                      </Button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!members.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  暂无团队成员
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>受邀邮箱</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>店铺范围</TableHead>
              <TableHead>状态 / 到期</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell className="font-medium">{invitation.email}</TableCell>
                <TableCell>{ROLE_LABELS[invitation.role] ?? invitation.role}</TableCell>
                <TableCell className="text-muted-foreground">
                  {namesForStores(stores, invitation.storeIds)}
                </TableCell>
                <TableCell>
                  <Badge variant={invitation.status === "PENDING" ? "secondary" : "outline"}>
                    {INVITATION_LABELS[invitation.status] ?? invitation.status}
                  </Badge>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {new Date(invitation.expiresAt).toLocaleDateString("zh-CN")}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {invitation.status === "PENDING" ? (
                    <span className="inline-flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => invitationAction("regenerate", invitation.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        重生成
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        className="text-destructive"
                        onClick={() => invitationAction("revoke", invitation.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                        撤销
                      </Button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!invitations.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  暂无邀请记录
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addExistingLocationFulfillerAction,
  createLocationFulfillerInvitationAction,
  setDefaultLocationFulfillerAction,
  reactivateLocationFulfillerAction,
  suspendLocationFulfillerAction,
  updateLocationFulfillerRoleAction,
} from "@/app/actions/location-fulfillers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Copy, Plus, UserPlus, Users, X } from "lucide-react";
import {
  WAREHOUSE_ROLE_LABELS,
  type WarehouseFulfillerRole,
} from "@/lib/application/relationship-foundation";

type RosterItem = {
  id: string;
  email: string;
  role: string;
  status: string;
  isDefault: boolean;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  user: { id: string; name: string | null; email: string } | null;
};

type ExistingCandidate = {
  userId: string;
  name: string;
  email: string;
  locations: Array<{ id: string; name: string }>;
};

const STATUS_LABELS: Record<string, string> = {
  INVITED: "待接受",
  EXPIRED: "邀请已过期",
  ACTIVE: "已启用",
  SUSPENDED: "已暂停",
  ENDED: "已结束",
};

function rosterStatus(person: RosterItem) {
  return person.status === "INVITED" && person.expiresAt && person.expiresAt <= new Date()
    ? "EXPIRED"
    : person.status;
}

export function LocationFulfillerManager({
  locationId,
  locationName,
  roster,
  existingCandidates,
}: {
  locationId: string;
  locationName: string;
  roster: RosterItem[];
  existingCandidates: ExistingCandidate[];
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [existingUserId, setExistingUserId] = useState(existingCandidates[0]?.userId || "");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dialogOpen && !dialog.open) dialog.showModal();
    if (dialogOpen && !invitationUrl) {
      requestAnimationFrame(() => emailInputRef.current?.focus());
    }
    if (!dialogOpen && dialog.open) dialog.close();
  }, [dialogOpen, invitationUrl]);

  function openInvitationDialog() {
    setError(null);
    setInvitationUrl(null);
    setCopied(false);
    setDialogOpen(true);
  }

  function closeInvitationDialog() {
    if (pending) return;
    setDialogOpen(false);
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setInvitationUrl(null);
    startTransition(() => {
      void createLocationFulfillerInvitationAction({
        locationId,
        email: String(data.get("email") || ""),
        role: String(data.get("role") || "OPERATOR"),
        isDefault: data.get("isDefault") === "on",
      }).then((result) => {
        if (!result.success) return setError(result.error);
        setInvitationUrl(`${window.location.origin}${result.invitationPath}`);
        setCopied(false);
        form.reset();
        router.refresh();
      });
    });
  }

  function addExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(() => {
      void addExistingLocationFulfillerAction({
        locationId,
        userId: String(data.get("userId") || ""),
        role: String(data.get("role") || "OPERATOR"),
        isDefault: data.get("isDefault") === "on",
      }).then((result) => {
        if (!result.success) return setError(result.error);
        setDialogOpen(false);
        router.refresh();
      });
    });
  }

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setRosterError(null);
    startTransition(() => {
      void action().then((result) => {
        if (!result.success) return setRosterError(result.error || "操作失败");
        router.refresh();
      });
    });
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              任务协作者
              {roster.length > 0 ? <Badge variant="secondary">{roster.length} 人</Badge> : null}
            </CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              当前仓库可开放订单处理、信息确认、盘点等任务协作；每个仓库的角色和默认负责人可独立调整。
            </p>
          </div>
          {roster.length > 0 ? (
            <Button type="button" size="sm" onClick={openInvitationDialog}>
              <Plus className="h-4 w-4" />
              添加协作人
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="-mx-4 -mb-4 divide-y border-t">
            {roster.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                <div className="space-y-1">
                  <p className="text-sm font-medium">还没有任务协作者</p>
                  <p className="text-sm text-muted-foreground">
                    添加第一位协作者后，可以把这个仓库范围内的任务交给对方处理。
                  </p>
                </div>
                <Button type="button" size="sm" onClick={openInvitationDialog}>
                  <UserPlus className="h-4 w-4" />
                  添加协作人
                </Button>
              </div>
            ) : (
              roster.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {person.user?.name || person.email}
                      </p>
                      {person.isDefault ? <Badge>默认负责人</Badge> : null}
                      <Badge variant="outline">
                        {STATUS_LABELS[rosterStatus(person)] ?? rosterStatus(person)}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {person.email} ·
                      {WAREHOUSE_ROLE_LABELS[person.role as WarehouseFulfillerRole] ?? person.role}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2 self-end sm:self-auto">
                    {person.status === "ACTIVE" ? (
                      <Select
                        aria-label={`调整 ${person.user?.name || person.email} 的任务角色`}
                        className="h-9 w-32"
                        defaultValue={person.role}
                        disabled={pending}
                        onChange={(event) =>
                          run(() =>
                            updateLocationFulfillerRoleAction(
                              locationId,
                              person.id,
                              event.target.value
                            )
                          )
                        }
                      >
                        <option value="OPERATOR">任务协作者</option>
                        <option value="MANAGER">任务负责人</option>
                      </Select>
                    ) : null}
                    {person.status === "ACTIVE" && !person.isDefault ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => setDefaultLocationFulfillerAction(locationId, person.id))
                        }
                      >
                        设为默认
                      </Button>
                    ) : null}
                    {person.status === "ACTIVE" || person.status === "INVITED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() => suspendLocationFulfillerAction(locationId, person.id))
                        }
                      >
                        暂停权限
                      </Button>
                    ) : person.status === "SUSPENDED" && person.user ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() =>
                          run(() => reactivateLocationFulfillerAction(locationId, person.id))
                        }
                      >
                        恢复协作
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {rosterError ? (
              <p className="px-4 py-3 text-sm text-destructive" role="alert">
                {rosterError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <dialog
        ref={dialogRef}
        aria-labelledby="fulfiller-dialog-title"
        aria-describedby="fulfiller-dialog-description"
        className="fixed bottom-auto left-1/2 right-auto top-1/2 m-0 w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/45"
        onCancel={(event) => {
          event.preventDefault();
          closeInvitationDialog();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          closeInvitationDialog();
        }}
        onClose={() => setDialogOpen(false)}
      >
        <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="space-y-1">
            <h2 id="fulfiller-dialog-title" className="text-base font-semibold">
              {invitationUrl ? "邀请链接已生成" : "添加任务协作者"}
            </h2>
            <p
              id="fulfiller-dialog-description"
              className="text-sm leading-5 text-muted-foreground"
            >
              {invitationUrl
                ? "把链接发给对方；对方接受后即可处理这个仓库范围内的任务。"
                : `为 ${locationName} 生成一条专属邀请链接。`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={closeInvitationDialog}
            disabled={pending}
            aria-label="关闭添加任务协作者弹窗"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {invitationUrl ? (
          <div className="space-y-5 px-5 py-5" aria-live="polite">
            <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-3 text-sm">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="font-medium">链接可以发送了</p>
                <p className="mt-1 leading-5 text-muted-foreground">
                  对方接受邀请前会在名单中显示为“待接受”。
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fulfiller-invitation-url">邀请链接</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="fulfiller-invitation-url"
                  value={invitationUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={async () => {
                    await navigator.clipboard.writeText(invitationUrl);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "已复制" : "复制链接"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
              <Button type="button" variant="ghost" onClick={closeInvitationDialog}>
                完成
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setInvitationUrl(null);
                  setCopied(false);
                }}
              >
                <Plus className="h-4 w-4" />
                继续添加
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-5 py-5">
            {existingCandidates.length ? (
              <form onSubmit={addExisting} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">从已有协作者中添加</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    对方已经接受过本企业的任务协作，可直接授权当前仓库，无需重新发邀请。
                  </p>
                </div>
                <Select
                  name="userId"
                  value={existingUserId}
                  onChange={(event) => setExistingUserId(event.target.value)}
                  disabled={pending}
                >
                  {existingCandidates.map((candidate) => (
                    <option key={candidate.userId} value={candidate.userId}>
                      {candidate.name} · 已在{" "}
                      {candidate.locations.map((location) => location.name).join("、")}
                    </option>
                  ))}
                </Select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select name="role" defaultValue="OPERATOR" disabled={pending}>
                    <option value="OPERATOR">任务协作者</option>
                    <option value="MANAGER">任务负责人</option>
                  </Select>
                  <Checkbox name="isDefault" label="设为默认负责人" disabled={pending} />
                </div>
                <Button type="submit" size="sm" disabled={pending || !existingUserId}>
                  <Plus className="h-4 w-4" />
                  直接添加到当前仓库
                </Button>
              </form>
            ) : null}

            {existingCandidates.length ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                或邀请新协作者
              </div>
            ) : null}

            <form onSubmit={invite} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="fulfiller-email">对方邮箱</Label>
                <Input
                  ref={emailInputRef}
                  id="fulfiller-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  required
                  disabled={pending}
                  aria-describedby={error ? "fulfiller-invite-error" : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fulfiller-role">任务角色</Label>
                <Select id="fulfiller-role" name="role" defaultValue="OPERATOR" disabled={pending}>
                  <option value="OPERATOR">任务协作者</option>
                  <option value="MANAGER">任务负责人</option>
                </Select>
                <p className="text-xs leading-5 text-muted-foreground">
                  任务负责人可以查看本仓库任务进度并指派任务；任务协作者只处理任务。两者都不会获得其他仓库、成本或企业管理权限。
                </p>
              </div>
              <Checkbox
                id="fulfiller-is-default"
                name="isDefault"
                label="设为默认负责人"
                disabled={pending}
              />

              {error ? (
                <p id="fulfiller-invite-error" className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={closeInvitationDialog}
                  disabled={pending}
                >
                  取消
                </Button>
                <Button type="submit" disabled={pending}>
                  <UserPlus className="h-4 w-4" />
                  {pending ? "正在生成..." : "生成邀请链接"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </>
  );
}

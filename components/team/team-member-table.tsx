"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTeamMemberAction, deactivateTeamMemberAction } from "@/app/actions/team";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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

interface TeamMemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string | null;
  storeAccesses: Array<{ storeId: string; role: string }>;
}

interface TeamMemberTableProps {
  stores: StoreOption[];
  roles: readonly string[];
  members: TeamMemberRow[];
  currentUserId: string;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "管理员",
  MANAGER: "运营负责人",
  LISTING: "上架人员",
  FULFILLMENT: "打包/发货",
  FINANCE: "财务结算",
  VIEWER: "只读",
};

function storeNames(stores: StoreOption[], member: TeamMemberRow) {
  const storeNameById = new Map(stores.map((store) => [store.id, store.name]));
  return member.storeAccesses
    .map((access) => storeNameById.get(access.storeId))
    .filter(Boolean)
    .join("、");
}

export function TeamMemberTable({
  stores,
  roles,
  members,
  currentUserId,
}: TeamMemberTableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [memberCreateError, setMemberCreateError] = useState<string | null>(null);
  const [memberCreateMessage, setMemberCreateMessage] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<string | null>(null);
  const [memberActionMessage, setMemberActionMessage] = useState<string | null>(null);

  const submitMemberCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setMemberCreateError(null);
    setMemberCreateMessage(null);

    startTransition(() => {
      void (async () => {
        const result = await createTeamMemberAction(new FormData(form));
        if (!result.success) {
          setMemberCreateError(result.error);
          return;
        }

        form.reset();
        setMemberCreateMessage("成员已保存");
        router.refresh();
      })();
    });
  };

  const deactivateMember = (userId: string) => {
    const formData = new FormData();
    formData.set("userId", userId);
    setMemberActionError(null);
    setMemberActionMessage(null);

    startTransition(() => {
      void (async () => {
        const result = await deactivateTeamMemberAction(formData);
        if (!result.success) {
          setMemberActionError(result.error);
          return;
        }

        setMemberActionMessage("成员已停用");
        router.refresh();
      })();
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>添加成员</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitMemberCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名</Label>
              <Input id="name" name="name" placeholder="如：张三" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" name="email" type="email" required placeholder="name@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">初始密码</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
                placeholder="至少 8 位"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">角色</Label>
              <Select id="role" name="role" defaultValue="FULFILLMENT">
                {roles.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role] ?? role}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>可访问店铺</Label>
              <div className="space-y-2 rounded-md border p-3">
                {stores.map((store, index) => (
                  <label key={store.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="storeIds"
                      value={store.id}
                      defaultChecked={index === 0}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>{store.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {memberCreateError ? (
              <p className="text-sm text-destructive">{memberCreateError}</p>
            ) : null}
            {memberCreateMessage ? (
              <p className="text-sm text-green-600">{memberCreateMessage}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "保存中..." : "保存成员"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>成员列表</CardTitle>
        </CardHeader>
        <CardContent>
          {memberActionError ? (
            <p className="mb-3 text-sm text-destructive">{memberActionError}</p>
          ) : null}
          {memberActionMessage ? (
            <p className="mb-3 text-sm text-green-600">{memberActionMessage}</p>
          ) : null}
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
                  <TableCell className="max-w-[260px] text-muted-foreground">
                    {storeNames(stores, member) || "未授权店铺"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>
                      {member.status === "ACTIVE" ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {member.id !== currentUserId && member.status === "ACTIVE" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() => deactivateMember(member.id)}
                      >
                        停用
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    暂无团队成员
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

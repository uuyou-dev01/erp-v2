"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManagedStoreAction } from "@/app/actions/store-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Plus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface StoreRow {
  id: string;
  name: string;
  code: string;
  currency: string;
  createdAt: string;
  memberCount: number;
  platformCount: number;
  locationCount: number;
}

export function StoreManagementPanel({
  stores,
  currentStoreId,
}: {
  stores: StoreRow[];
  currentStoreId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [storeCreateError, setStoreCreateError] = useState<string | null>(null);
  const [storeCreateMessage, setStoreCreateMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const submitStoreCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setStoreCreateError(null);
    setStoreCreateMessage(null);

    startTransition(() => {
      void (async () => {
        const result = await createManagedStoreAction(new FormData(form));
        if (!result.success) {
          setStoreCreateError(result.error);
          return;
        }

        form.reset();
        setStoreCreateMessage("店铺已创建");
        setCreateOpen(false);
        router.refresh();
      })();
    });
  };

  return (
    <div className="space-y-4">
      {storeCreateMessage ? (
        <p role="status" className="text-sm text-emerald-600">
          {storeCreateMessage}
        </p>
      ) : null}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle>店铺列表</CardTitle>
            <p className="text-sm text-muted-foreground">
              查看当前企业管理的店铺及其成员、平台账号和仓库位置。
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setStoreCreateError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            新增店铺
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>店铺</TableHead>
                <TableHead>默认币种</TableHead>
                <TableHead className="text-right">成员</TableHead>
                <TableHead className="text-right">平台账号</TableHead>
                <TableHead className="text-right">仓库位置</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>
                    <div className="font-medium">{store.name}</div>
                    <div className="text-xs text-muted-foreground">{store.code}</div>
                  </TableCell>
                  <TableCell>{store.currency}</TableCell>
                  <TableCell className="text-right">{store.memberCount}</TableCell>
                  <TableCell className="text-right">{store.platformCount}</TableCell>
                  <TableCell className="text-right">{store.locationCount}</TableCell>
                  <TableCell>
                    {store.id === currentStoreId ? (
                      <Badge>当前店铺</Badge>
                    ) : (
                      <Badge variant="outline">可管理</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {stores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    暂无店铺
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="新增店铺"
        description="创建后可继续配置成员、平台账号和仓库位置。"
        size="sm"
        closeDisabled={pending}
      >
        <form onSubmit={submitStoreCreate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-name">店铺名称</Label>
            <Input
              id="store-name"
              name="name"
              required
              placeholder="如：日本 Mercari 店"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-code">店铺代码</Label>
            <Input id="store-code" name="code" required placeholder="如：JP_MERCARI" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store-currency">默认币种</Label>
            <Input id="store-currency" name="currency" defaultValue="CNY" maxLength={3} />
          </div>
          {storeCreateError ? (
            <p role="alert" className="text-sm text-destructive">
              {storeCreateError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "创建中..." : "创建店铺"}
            </Button>
          </div>
        </form>
      </ActionDialog>
    </div>
  );
}

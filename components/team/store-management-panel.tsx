"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManagedStoreAction } from "@/app/actions/store-settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        router.refresh();
      })();
    });
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>新增店铺</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitStoreCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">店铺名称</Label>
              <Input id="name" name="name" required placeholder="如：日本 Mercari 店" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">店铺代码</Label>
              <Input id="code" name="code" required placeholder="如：JP_MERCARI" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">默认币种</Label>
              <Input id="currency" name="currency" defaultValue="CNY" maxLength={3} />
            </div>
            {storeCreateError ? (
              <p className="text-sm text-destructive">{storeCreateError}</p>
            ) : null}
            {storeCreateMessage ? (
              <p className="text-sm text-green-600">{storeCreateMessage}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "创建中..." : "创建店铺"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>店铺列表</CardTitle>
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
    </div>
  );
}

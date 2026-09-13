"use client";

import { useState, useTransition } from "react";
import { requestWarehouseStocktake } from "@/app/actions/warehouse-inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionDialog } from "@/components/ui/action-dialog";
import { ListPagination } from "@/components/ui/list-pagination";

export function WarehouseInventoryView({
  warehouses,
}: {
  warehouses: Array<{
    locationId: string;
    code: string;
    name: string;
    organizationName: string;
    rows: Array<{ skuId: string; code: string; name: string; physical: string; reserved: string }>;
  }>;
}) {
  const [selectedId, setSelectedId] = useState(warehouses[0]?.locationId ?? "");
  const [query, setQuery] = useState("");
  const [requestedPage, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const warehouse = warehouses.find((w) => w.locationId === selectedId) ?? warehouses[0];
  if (!warehouse)
    return (
      <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        你目前没有合作中的仓库负责人权限。
      </p>
    );
  const rows = warehouse.rows.filter((r) =>
    `${r.code} ${r.name}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())
  );
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(rows.length / 20)));
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap gap-2">
        {warehouses.map((w) => (
          <Button
            key={w.locationId}
            variant={w.locationId === warehouse.locationId ? "secondary" : "outline"}
            onClick={() => {
              setSelectedId(w.locationId);
              setPage(1);
              setQuery("");
              setNotice("");
            }}
          >
            {w.name} · {w.code}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {warehouse.name} · {warehouse.code}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            货主：{warehouse.organizationName} · {warehouse.rows.length} 种商品
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setNote("");
            setError("");
            setOpen(true);
          }}
        >
          反馈差异，请货主盘点
        </Button>
      </div>
      {notice && (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      )}
      <Input
        aria-label="搜索仓库商品"
        placeholder="搜索商品或 SKU"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
      />
      <div className="rounded-lg border bg-card">
        <div className="divide-y">
          {rows.slice((page - 1) * 20, page * 20).map((r) => (
            <div key={r.skuId} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="break-words font-medium">{r.name}</p>
                <p className="break-all text-xs text-muted-foreground">SKU {r.code}</p>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <p>在仓 {r.physical} 件</p>
                <p className="text-xs text-muted-foreground">其中待发货占用 {r.reserved} 件</p>
              </div>
            </div>
          ))}
          {!rows.length && (
            <p className="p-6 text-sm text-muted-foreground">没有符合条件的在仓商品</p>
          )}
        </div>
        <ListPagination page={page} pageSize={20} total={rows.length} onPageChange={setPage} />
      </div>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        closeDisabled={pending}
        title="请货主盘点"
        description="说明商品、系统数量与实物差异。提交后通知货主核对，库存数量由货主盘点后调整。"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError("");
              try {
                const result = await requestWarehouseStocktake({
                  locationId: warehouse.locationId,
                  note,
                });
                if (!result.success) {
                  setError(result.error);
                  return;
                }
                setNotice("已通知货主核对库存");
                setOpen(false);
              } catch {
                setError("提交失败，请重试");
              }
            });
          }}
        >
          <Textarea
            aria-label="库存差异说明"
            required
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="例如：SKU… 系统显示 5 件，实物找到 4 件，请核对。"
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={pending || !note.trim()}>
            {pending ? "提交中…" : "通知货主盘点"}
          </Button>
        </form>
      </ActionDialog>
    </div>
  );
}

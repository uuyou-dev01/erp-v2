"use client";

import { useMemo, useState, useTransition } from "react";
import {
  activateServiceAgreementAction,
  createServiceAgreementAction,
  grantScopedAccessAction,
  syncLegacyFoundationAction,
} from "@/app/actions/multi-party";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const SERVICE_TYPES = [
  ["RECEIVING", "收货"],
  ["INSPECTION", "检查"],
  ["STORAGE", "仓储"],
  ["FULFILLMENT", "代发"],
  ["RETURN", "退件处理"],
] as const;

type Option = { id: string; name: string };

export function BusinessStructureManager({
  currentOrganizationId,
  organizations,
  pools,
  channels,
  locations,
}: {
  currentOrganizationId: string;
  organizations: Option[];
  pools: Option[];
  channels: Option[];
  locations: Array<Option & { operatorOrganizationId: string | null }>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [providerOrganizationId, setProviderOrganizationId] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(["FULFILLMENT"]);
  const [scopeType, setScopeType] = useState<"INVENTORY_POOL" | "CHANNEL" | "LOCATION">("INVENTORY_POOL");
  const providerLocations = useMemo(
    () => locations.filter((location) => location.operatorOrganizationId === providerOrganizationId),
    [locations, providerOrganizationId],
  );

  function run(task: () => Promise<{ success: boolean; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await task();
      setMessage(result.success ? "已保存" : (result.error ?? "操作失败"));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="font-medium">兼容数据同步</p>
          <p className="text-sm text-muted-foreground">从现有店铺、平台和访问权限补齐货盘、销售店铺与仓库授权。</p>
        </div>
        <Button variant="outline" disabled={pending} onClick={() => run(syncLegacyFoundationAction)}>
          {pending ? "处理中…" : "同步旧数据"}
        </Button>
      </div>

      <form
        className="grid gap-4 rounded-lg border p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          run(() =>
            createServiceAgreementAction({
              clientOrganizationId: currentOrganizationId,
              providerOrganizationId: String(form.get("providerOrganizationId") || ""),
              inventoryPoolId: String(form.get("inventoryPoolId") || "") || undefined,
              locationId: String(form.get("locationId") || "") || undefined,
              serviceTypes: selectedServices,
              settlementCurrency: String(form.get("settlementCurrency") || "CNY").toUpperCase(),
              paymentTermsDays: Number(form.get("paymentTermsDays") || 0),
              notes: String(form.get("notes") || "") || undefined,
            }),
          );
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="providerOrganizationId">服务主体</Label>
          <Select
            id="providerOrganizationId"
            name="providerOrganizationId"
            required
            value={providerOrganizationId}
            onChange={(event) => setProviderOrganizationId(event.target.value)}
          >
            <option value="">请选择合作经营主体</option>
            {organizations.filter((item) => item.id !== currentOrganizationId).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="inventoryPoolId">客户货盘</Label>
          <Select id="inventoryPoolId" name="inventoryPoolId">
            <option value="">全部授权货盘</option>
            {pools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="locationId">服务仓库</Label>
          <Select id="locationId" name="locationId">
            <option value="">协议后补充</option>
            {providerLocations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="settlementCurrency">结算币种</Label>
            <Input id="settlementCurrency" name="settlementCurrency" defaultValue="CNY" maxLength={3} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTermsDays">账期（天）</Label>
            <Input id="paymentTermsDays" name="paymentTermsDays" type="number" min={0} defaultValue={0} />
          </div>
        </div>
        <fieldset className="space-y-2 md:col-span-2">
          <legend className="text-sm font-medium">允许的服务</legend>
          <div className="flex flex-wrap gap-3">
            {SERVICE_TYPES.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedServices.includes(value)}
                  onChange={(event) => setSelectedServices((current) =>
                    event.target.checked ? [...current, value] : current.filter((item) => item !== value),
                  )}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notes">约定说明</Label>
          <Textarea id="notes" name="notes" placeholder="实际费用由服务方提交，客户确认后进入结算。" />
        </div>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={pending || selectedServices.length === 0}>创建服务协议</Button>
          {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
        </div>
      </form>

      <form className="grid gap-3 rounded-lg border p-4 md:grid-cols-5" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        run(() => grantScopedAccessAction({
          scopeType,
          scopeId: String(form.get("scopeId") || ""),
          userEmail: String(form.get("userEmail") || ""),
          role: String(form.get("role") || "VIEWER"),
          permissions: scopeType === "INVENTORY_POOL"
            ? { viewQuantity: true, viewCost: false }
            : scopeType === "LOCATION"
              ? { receive: true, inspect: true, ship: true }
              : { viewOrders: true },
        }));
      }}>
        <div className="space-y-2"><Label>授权类型</Label><Select value={scopeType} onChange={(event) => setScopeType(event.target.value as typeof scopeType)}><option value="INVENTORY_POOL">货盘</option><option value="CHANNEL">销售店铺</option><option value="LOCATION">仓库</option></Select></div>
        <div className="space-y-2"><Label htmlFor="scopeId">授权对象</Label><Select id="scopeId" name="scopeId" required>{(scopeType === "INVENTORY_POOL" ? pools : scopeType === "LOCATION" ? locations.filter((item) => item.operatorOrganizationId === currentOrganizationId) : channels).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></div>
        <div className="space-y-2"><Label htmlFor="userEmail">账号邮箱</Label><Input id="userEmail" name="userEmail" type="email" required placeholder="partner@example.com" /></div>
        <div className="space-y-2"><Label htmlFor="role">能力角色</Label><Select id="role" name="role"><option value="VIEWER">只读</option><option value="OPERATOR">操作员</option><option value="MANAGER">管理</option></Select></div>
        <div className="flex items-end"><Button type="submit" variant="outline" disabled={pending}>授予对象权限</Button></div>
      </form>
    </div>
  );
}

export function AgreementActivateButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return <span className="inline-flex items-center gap-2">
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
      const result = await activateServiceAgreementAction(id);
      setMessage(result.success ? "已启用" : result.error);
    })}>{pending ? "启用中…" : "服务方确认启用"}</Button>
    {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
  </span>;
}

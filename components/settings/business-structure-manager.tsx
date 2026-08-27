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
import { ActionDialog } from "@/components/ui/action-dialog";
import { FilePlus2, ShieldCheck } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [providerOrganizationId, setProviderOrganizationId] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>(["FULFILLMENT"]);
  const [scopeType, setScopeType] = useState<"INVENTORY_POOL" | "CHANNEL" | "LOCATION">(
    "INVENTORY_POOL"
  );
  const providerLocations = useMemo(
    () =>
      locations.filter((location) => location.operatorOrganizationId === providerOrganizationId),
    [locations, providerOrganizationId]
  );

  function run(
    task: () => Promise<{ success: boolean; error?: string }>,
    successMessage = "已保存",
    onSuccess?: () => void
  ) {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.success) {
        setError(result.error ?? "操作失败");
        return;
      }
      setMessage(successMessage);
      onSuccess?.();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="font-medium">兼容数据同步</p>
          <p className="text-sm text-muted-foreground">
            从现有店铺、平台和访问权限补齐货盘、销售店铺与仓库授权。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(syncLegacyFoundationAction)}
        >
          {pending ? "处理中…" : "同步旧数据"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setError(null);
            setAgreementOpen(true);
          }}
        >
          <FilePlus2 className="mt-0.5 h-5 w-5 text-primary" />
          <span>
            <span className="block font-medium">创建服务协议</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              约定服务主体、仓库、服务范围和结算方式。
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => {
            setError(null);
            setAccessOpen(true);
          }}
        >
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <span>
            <span className="block font-medium">授予对象权限</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              针对货盘、销售店铺或仓库授予账号能力。
            </span>
          </span>
        </button>
      </div>

      {message ? (
        <p role="status" className="text-sm text-emerald-600">
          {message}
        </p>
      ) : null}
      {error && !agreementOpen && !accessOpen ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <ActionDialog
        open={agreementOpen}
        onOpenChange={(nextOpen) => {
          setAgreementOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
        title="创建服务协议"
        description="配置双方的服务范围与结算约定；创建后由服务方确认启用。"
        placement="end"
        size="lg"
        closeDisabled={pending}
      >
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
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
              "服务协议已创建",
              () => setAgreementOpen(false)
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
              {organizations
                .filter((item) => item.id !== currentOrganizationId)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="inventoryPoolId">客户货盘</Label>
            <Select id="inventoryPoolId" name="inventoryPoolId">
              <option value="">全部授权货盘</option>
              {pools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="locationId">服务仓库</Label>
            <Select id="locationId" name="locationId">
              <option value="">协议后补充</option>
              {providerLocations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="settlementCurrency">结算币种</Label>
              <Input
                id="settlementCurrency"
                name="settlementCurrency"
                defaultValue="CNY"
                maxLength={3}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTermsDays">账期（天）</Label>
              <Input
                id="paymentTermsDays"
                name="paymentTermsDays"
                type="number"
                min={0}
                defaultValue={0}
              />
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
                    onChange={(event) =>
                      setSelectedServices((current) =>
                        event.target.checked
                          ? [...current, value]
                          : current.filter((item) => item !== value)
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">约定说明</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="实际费用由服务方提交，客户确认后进入结算。"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive md:col-span-2">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4 md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setAgreementOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending || selectedServices.length === 0}>
              {pending ? "创建中…" : "创建服务协议"}
            </Button>
          </div>
        </form>
      </ActionDialog>

      <ActionDialog
        open={accessOpen}
        onOpenChange={(nextOpen) => {
          setAccessOpen(nextOpen);
          if (!nextOpen) setError(null);
        }}
        title="授予对象权限"
        description="权限只对所选业务对象生效，不会自动扩大到企业其他数据。"
        size="md"
        closeDisabled={pending}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                grantScopedAccessAction({
                  scopeType,
                  scopeId: String(form.get("scopeId") || ""),
                  userEmail: String(form.get("userEmail") || ""),
                  role: String(form.get("role") || "VIEWER"),
                  permissions:
                    scopeType === "INVENTORY_POOL"
                      ? { viewQuantity: true, viewCost: false }
                      : scopeType === "LOCATION"
                        ? { receive: true, inspect: true, ship: true }
                        : { viewOrders: true },
                }),
              "对象权限已授予",
              () => setAccessOpen(false)
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="scopeType">授权类型</Label>
            <Select
              id="scopeType"
              value={scopeType}
              onChange={(event) => setScopeType(event.target.value as typeof scopeType)}
            >
              <option value="INVENTORY_POOL">货盘</option>
              <option value="CHANNEL">销售店铺</option>
              <option value="LOCATION">仓库</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scopeId">授权对象</Label>
            <Select id="scopeId" name="scopeId" required>
              {(scopeType === "INVENTORY_POOL"
                ? pools
                : scopeType === "LOCATION"
                  ? locations.filter(
                      (item) => item.operatorOrganizationId === currentOrganizationId
                    )
                  : channels
              ).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="userEmail">账号邮箱</Label>
            <Input
              id="userEmail"
              name="userEmail"
              type="email"
              required
              placeholder="partner@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">能力角色</Label>
            <Select id="role" name="role">
              <option value="VIEWER">只读</option>
              <option value="OPERATOR">操作员</option>
              <option value="MANAGER">管理</option>
            </Select>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setAccessOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "授权中…" : "授予权限"}
            </Button>
          </div>
        </form>
      </ActionDialog>
    </div>
  );
}

export function AgreementActivateButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await activateServiceAgreementAction(id);
            setMessage(result.success ? "已启用" : result.error);
          })
        }
      >
        {pending ? "启用中…" : "服务方确认启用"}
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </span>
  );
}

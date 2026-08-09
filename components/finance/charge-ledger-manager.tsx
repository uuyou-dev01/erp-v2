"use client";

import { useState, useTransition } from "react";
import {
  createChargeCategoryAction,
  createChargeEventAction,
  createChargeRuleAction,
  createSettlementFromChargesAction,
  reverseChargeEventAction,
  transitionChargeEventAction,
} from "@/app/actions/charges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Option = { id: string; name: string };
type Category = Option & { code: string; groupCode: string };

export function ChargeCreationPanel({
  currentOrganizationId,
  organizations,
  categories,
}: {
  currentOrganizationId: string;
  organizations: Option[];
  categories: Category[];
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const counterpartyId = String(form.get("counterpartyId") || "");
        const counterparty = organizations.find((item) => item.id === counterpartyId);
        const current = organizations.find((item) => item.id === currentOrganizationId);
        if (!counterparty || !current) return setMessage("请选择费用对方");
        setMessage(null);
        startTransition(async () => {
          const payer = direction === "RECEIVABLE" ? counterparty : current;
          const payee = direction === "RECEIVABLE" ? current : counterparty;
          const result = await createChargeEventAction({
            categoryId: String(form.get("categoryId") || ""),
            sourceType: String(form.get("sourceType") || "MANUAL"),
            sourceId: String(form.get("sourceId") || "manual"),
            idempotencyKey: String(form.get("idempotencyKey") || "") || undefined,
            amountKind: String(form.get("amountKind")) as "ESTIMATE" | "ACTUAL",
            amount: String(form.get("amount") || ""),
            currency: String(form.get("currency") || "CNY"),
            baseCurrency: String(form.get("baseCurrency") || "") || undefined,
            fxRate: String(form.get("fxRate") || "") || undefined,
            description: String(form.get("description") || ""),
            submit: form.get("submit") === "on",
            parties: [
              { role: "PAYER", partyType: "ORGANIZATION", partyId: payer.id, organizationId: payer.id, name: payer.name },
              { role: "PAYEE", partyType: "ORGANIZATION", partyId: payee.id, organizationId: payee.id, name: payee.name },
            ],
          });
          setMessage(result.success ? "费用已保存" : result.error);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="direction">费用方向</Label>
        <Select id="direction" value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)}>
          <option value="RECEIVABLE">向对方收取</option>
          <option value="PAYABLE">由我方支付</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="baseCurrency">本位币</Label><Input id="baseCurrency" name="baseCurrency" placeholder="默认当前店铺币种" maxLength={3} /></div>
        <div className="space-y-2"><Label htmlFor="fxRate">汇率快照</Label><Input id="fxRate" name="fxRate" type="number" min="0" step="0.00000001" placeholder="跨币种必填" /></div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="counterpartyId">对方经营主体</Label>
        <Select id="counterpartyId" name="counterpartyId" required>
          <option value="">请选择</option>
          {organizations.filter((item) => item.id !== currentOrganizationId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="categoryId">费用分类</Label>
        <Select id="categoryId" name="categoryId" required>
          {categories.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.groupCode}）</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_88px] gap-3">
        <div className="space-y-2"><Label htmlFor="amount">金额</Label><Input id="amount" name="amount" type="number" min="0.0001" step="0.0001" required /></div>
        <div className="space-y-2"><Label htmlFor="currency">币种</Label><Input id="currency" name="currency" defaultValue="CNY" maxLength={3} required /></div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="amountKind">金额性质</Label>
        <Select id="amountKind" name="amountKind" defaultValue="ACTUAL"><option value="ACTUAL">实际</option><option value="ESTIMATE">预估</option></Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2"><Label htmlFor="sourceType">来源类型</Label><Input id="sourceType" name="sourceType" defaultValue="MANUAL" required /></div>
        <div className="space-y-2"><Label htmlFor="sourceId">来源编号</Label><Input id="sourceId" name="sourceId" defaultValue="manual" required /></div>
      </div>
      <div className="space-y-2 md:col-span-2"><Label htmlFor="description">说明</Label><Input id="description" name="description" placeholder="运费报销、代发费、检查费…" required /></div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="submit" defaultChecked /> 保存后提交给付款方确认</label>
        <Button type="submit" disabled={pending}>{pending ? "保存中…" : "保存费用"}</Button>
        {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
      </div>
    </form>
  );
}

export function ChargeConfigurationPanel({ categories }: { categories: Category[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [method, setMethod] = useState<"MANUAL" | "FIXED" | "PER_ITEM" | "PERCENTAGE">("MANUAL");

  function complete(result: { success: boolean; error?: string }, success: string) {
    setMessage(result.success ? success : (result.error ?? "操作失败"));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        startTransition(async () => complete(await createChargeCategoryAction({ groupCode: String(form.get("groupCode")), code: String(form.get("code")), name: String(form.get("name")) }), "自定义分类已创建"));
      }}>
        <p className="font-medium">自定义费用子类</p>
        <Select name="groupCode" defaultValue="INSPECTION"><option value="SHIPPING">运输</option><option value="FULFILLMENT">代发</option><option value="INSPECTION">检查</option><option value="STORAGE">仓储</option><option value="PACKAGING">包材</option><option value="AFTER_SALES">售后</option><option value="OTHER">其他</option></Select>
        <div className="grid grid-cols-2 gap-3"><Input name="code" placeholder="REINFORCEMENT" required /><Input name="name" placeholder="加固费" required /></div>
        <Button type="submit" variant="outline" disabled={pending}>新增分类</Button>
      </form>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        startTransition(async () => complete(await createChargeRuleAction({ categoryId: String(form.get("categoryId")), name: String(form.get("name")), calculationMethod: method, fixedAmount: String(form.get("fixedAmount") || "") || undefined, rate: String(form.get("rate") || "") || undefined, currency: String(form.get("currency") || "") || undefined }), "收费规则已创建"));
      }}>
        <p className="font-medium">预估收费规则</p>
        <div className="grid grid-cols-2 gap-3"><Select name="categoryId" required>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><Input name="name" placeholder="代发按件" required /></div>
        <Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="MANUAL">手工</option><option value="FIXED">固定金额</option><option value="PER_ITEM">按件</option><option value="PERCENTAGE">按比例</option></Select>
        <div className="grid grid-cols-3 gap-3"><Input name="fixedAmount" type="number" step="0.0001" placeholder="金额/单价" /><Input name="rate" type="number" step="0.00000001" placeholder="比例" /><Input name="currency" defaultValue="CNY" maxLength={3} /></div>
        <Button type="submit" variant="outline" disabled={pending}>新增规则</Button>
      </form>
      {message ? <p className="text-sm text-muted-foreground lg:col-span-2">{message}</p> : null}
    </div>
  );
}

export function ChargeRowActions({
  id,
  status,
  currentOrganizationId,
  payerOrganizationId,
  payeeOrganizationId,
}: {
  id: string;
  status: string;
  currentOrganizationId: string;
  payerOrganizationId?: string | null;
  payeeOrganizationId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const act = (task: () => Promise<{ success: boolean; error?: string }>) => startTransition(async () => {
    const result = await task(); setMessage(result.success ? "已更新" : (result.error ?? "操作失败"));
  });
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {status === "DRAFT" && payeeOrganizationId === currentOrganizationId ? <Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => transitionChargeEventAction(id, "SUBMITTED"))}>提交</Button> : null}
    {status === "SUBMITTED" && payerOrganizationId === currentOrganizationId ? <><Button size="sm" disabled={pending} onClick={() => act(() => transitionChargeEventAction(id, "CONFIRMED"))}>确认</Button><Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => transitionChargeEventAction(id, "DISPUTED", window.prompt("争议原因") || ""))}>争议</Button></> : null}
    {["CONFIRMED", "PARTIALLY_SETTLED"].includes(status) ? <><Button size="sm" variant="outline" disabled={pending} onClick={() => act(() => createSettlementFromChargesAction([id]))}>整理线下结算</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => act(() => reverseChargeEventAction(id, window.prompt("冲销原因") || ""))}>冲销</Button></> : null}
    {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
  </div>;
}

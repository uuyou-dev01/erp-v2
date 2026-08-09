"use client";

import { useState, useTransition } from "react";
import {
  confirmChannelStatementAction,
  importChannelStatementCsvAction,
  reconcileChannelStatementAction,
} from "@/app/actions/channel-statements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ImportChannel = { id: string; name: string; defaultCurrency: string | null; importTemplates: Record<string, Record<string, string>> };

export function ChannelStatementImporter({ channels }: { channels: ImportChannel[] }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [rawCsv, setRawCsv] = useState("externalLineId,lineType,externalOrderNo,amount,currency,description,occurredAt\n");
  const [channelId, setChannelId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [mappingText, setMappingText] = useState("{}");
  const templates = channels.find((channel) => channel.id === channelId)?.importTemplates ?? {};
  return <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setMessage(null);
    startTransition(async () => {
      let columnMapping: Record<string, string> | undefined;
      try { const parsed = JSON.parse(mappingText); if (parsed && typeof parsed === "object" && Object.keys(parsed).length) columnMapping = parsed; } catch { return setMessage("字段映射必须是 JSON 对象"); }
      const result = await importChannelStatementCsvAction({ salesChannelAccountId: String(form.get("channelId")), externalStatementNo: String(form.get("statementNo") || "") || undefined, currency: String(form.get("currency") || "CNY"), periodStart: String(form.get("periodStart") || "") || undefined, periodEnd: String(form.get("periodEnd") || "") || undefined, rawCsv, templateName: templateName || undefined, columnMapping });
      setMessage(result.success ? `已导入 ${result.rows} 行` : result.error);
    });
  }}>
    <div className="space-y-2"><Label htmlFor="channelId">销售店铺</Label><Select id="channelId" name="channelId" required value={channelId} onChange={(event) => { setChannelId(event.target.value); setTemplateName(""); setMappingText("{}"); }}><option value="">请选择</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</Select></div>
    <div className="grid grid-cols-[1fr_88px] gap-3"><div className="space-y-2"><Label htmlFor="statementNo">外部账单号</Label><Input id="statementNo" name="statementNo" /></div><div className="space-y-2"><Label htmlFor="currency">币种</Label><Input id="currency" name="currency" defaultValue={channels[0]?.defaultCurrency ?? "CNY"} maxLength={3} required /></div></div>
    <div className="space-y-2"><Label htmlFor="periodStart">期间开始</Label><Input id="periodStart" name="periodStart" type="date" /></div>
    <div className="space-y-2"><Label htmlFor="periodEnd">期间结束</Label><Input id="periodEnd" name="periodEnd" type="date" /></div>
    <div className="space-y-2 md:col-span-2"><div className="flex items-center justify-between gap-3"><Label htmlFor="rawCsv">CSV 内容</Label><Input aria-label="选择 CSV 文件" className="h-8 max-w-64" type="file" accept=".csv,text/csv" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setRawCsv(await file.text()); }} /></div><Textarea id="rawCsv" value={rawCsv} onChange={(event) => setRawCsv(event.target.value)} className="min-h-48 font-mono text-xs" /></div>
    <details className="space-y-3 md:col-span-2"><summary className="cursor-pointer text-sm font-medium">非标准 CSV 字段映射与模板</summary><div className="mt-3 grid gap-3 md:grid-cols-2"><Select aria-label="已保存映射模板" value={templateName} onChange={(event) => { const name = event.target.value; setTemplateName(name); setMappingText(JSON.stringify(templates[name] ?? {}, null, 2)); }}><option value="">新模板/不保存</option>{Object.keys(templates).map((name) => <option key={name} value={name}>{name}</option>)}</Select><Input aria-label="模板名称" value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="模板名称（填写后保存）" /><Textarea aria-label="字段映射 JSON" className="min-h-28 font-mono text-xs md:col-span-2" value={mappingText} onChange={(event) => setMappingText(event.target.value)} placeholder={'{"lineType":"费用类型","amount":"金额"}'} /></div></details>
    <div className="flex items-center gap-3 md:col-span-2"><Button type="submit" disabled={pending || channels.length === 0}>{pending ? "导入中…" : "导入账单"}</Button>{message ? <span className="text-sm text-muted-foreground">{message}</span> : null}</div>
  </form>;
}

export function ChannelStatementActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const run = (task: () => Promise<{ success: boolean; error?: string; matched?: number; exceptions?: number }>) => startTransition(async () => {
    const result = await task();
    setMessage(result.success ? ("matched" in result ? `匹配 ${result.matched ?? 0}，异常 ${result.exceptions ?? 0}` : "已确认") : (result.error ?? "操作失败"));
  });
  return <div className="flex flex-wrap items-center justify-end gap-2">
    {["IMPORTED", "RECONCILED"].includes(status) ? <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => reconcileChannelStatementAction(id))}>重新匹配</Button> : null}
    {status === "RECONCILED" ? <Button size="sm" disabled={pending} onClick={() => run(() => confirmChannelStatementAction(id))}>确认入账</Button> : null}
    {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
  </div>;
}

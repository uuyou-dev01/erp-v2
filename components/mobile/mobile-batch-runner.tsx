"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type BatchTask = { id: string; title: string; subtitle: string | null; action: string; actionLabel: string };

const ACTION_LABELS: Record<string, string> = {
  fillLogistics: "批量补物流",
  confirmArrival: "批量确认到货",
  inbound: "批量确认入库",
};

function groupAction(action: string) {
  return action === "receivePurchase" ? "confirmArrival" : action;
}

export function MobileBatchRunner({ tasks, locations }: { tasks: BatchTask[]; locations: Array<{ id: string; name: string; code: string }> }) {
  const actions = useMemo(() => [...new Set(tasks.map((task) => groupAction(task.action)))], [tasks]);
  const [action, setAction] = useState(actions[0] || "fillLogistics");
  const visible = tasks.filter((task) => groupAction(task.action) === action);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [carrier, setCarrier] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const switchAction = (next: string) => { setAction(next); setSelected(new Set()); setMessage(null); };
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const submit = () => startTransition(async () => {
    setMessage(null);
    const chosen = visible.filter((task) => selected.has(task.id));
    const items = chosen.map((task) => ({
      taskId: task.id,
      fields: action === "fillLogistics"
        ? { carrier, destinationLocationId: locationId, purchaseTrackingNo: tracking[task.id] || "" }
        : action === "inbound"
          ? { locationId }
          : { arrivalLocationId: locationId, arrivedAt: new Date().toISOString(), isComplete: true },
    }));
    const response = await fetch("/api/v1/mobile/tasks/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ batchId: crypto.randomUUID(), action, items }) });
    const body = await response.json() as { successCount?: number; failureCount?: number; error?: { message?: string } };
    if (!response.ok) { setMessage(body.error?.message || "批量处理失败"); return; }
    setMessage(`完成 ${body.successCount || 0} 项${body.failureCount ? `，${body.failureCount} 项需要重新检查` : ""}`);
    if (!body.failureCount) setSelected(new Set());
  });

  if (!actions.length) return <div className="py-16 text-center text-sm text-slate-500">当前没有可批量处理的任务</div>;
  return <div className="space-y-5">
    <div className="flex gap-2 overflow-x-auto">{actions.map((item) => <button key={item} type="button" onClick={() => switchAction(item)} className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${action === item ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>{ACTION_LABELS[item]}</button>)}</div>
    <div className="space-y-3"><div><label htmlFor="batch-location" className="mb-1.5 block text-xs font-semibold text-slate-600">{action === "fillLogistics" ? "目标位置" : "操作位置"}</label><Select id="batch-location" className="h-11 rounded-xl" value={locationId} onChange={(event) => setLocationId(event.target.value)}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name} · {location.code}</option>)}</Select></div>{action === "fillLogistics" ? <div><label htmlFor="batch-carrier" className="mb-1.5 block text-xs font-semibold text-slate-600">承运商</label><Input id="batch-carrier" className="h-11 rounded-xl" value={carrier} onChange={(event) => setCarrier(event.target.value)} placeholder="例如：顺丰" /></div> : null}</div>
    <div className="divide-y border-y border-slate-200">{visible.map((task) => <div key={task.id} className="py-4"><label className="flex items-start gap-3"><input type="checkbox" checked={selected.has(task.id)} onChange={() => toggle(task.id)} className="mt-1 h-5 w-5 rounded border-slate-300 text-blue-600" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-slate-900">{task.title}</span>{task.subtitle ? <span className="mt-1 block truncate text-xs text-slate-500">{task.subtitle}</span> : null}</span></label>{action === "fillLogistics" && selected.has(task.id) ? <Input aria-label={`${task.title} 物流单号`} className="mt-3 h-10 rounded-xl" value={tracking[task.id] || ""} onChange={(event) => setTracking((current) => ({ ...current, [task.id]: event.target.value }))} placeholder="扫描或粘贴这件商品的物流单号" /> : null}</div>)}</div>
    {message ? <div role="status" className="rounded-xl bg-blue-50 px-3 py-3 text-sm text-blue-800"><Check className="mr-2 inline h-4 w-4" />{message}</div> : null}
    <Button className="h-12 w-full rounded-xl bg-blue-600" disabled={pending || !selected.size || !locationId || (action === "fillLogistics" && [...selected].some((id) => !tracking[id]?.trim()))} onClick={submit}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}确认处理 {selected.size} 项</Button>
  </div>;
}

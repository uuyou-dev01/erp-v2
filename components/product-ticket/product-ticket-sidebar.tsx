import type { ProductTicket } from "@/lib/application/workflow-queries";
import { Badge } from "@/components/ui/badge";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "未记录"}</p>
    </div>
  );
}

export function ProductTicketSidebar({ ticket }: { ticket: ProductTicket }) {
  return (
    <aside className="space-y-4">
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">当前对象</h3>
        <div className="space-y-3">
          <Field label="当前位置" value={ticket.locationText} />
          <Field label="主生命周期" value={ticket.lifecycleStageLabel} />
          <Field label="库存状态" value={ticket.inventoryStatus} />
          <Field label="平台状态" value={ticket.platformText} />
          <Field label="负责人" value={ticket.assigneeName} />
        </div>
      </div>
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">风险层</h3>
        <div className="flex flex-wrap gap-2">
          {ticket.exceptionMessage ? (
            <Badge variant={ticket.priority === "critical" ? "destructive" : "outline"}>
              {ticket.exceptionMessage}
            </Badge>
          ) : (
            <Badge variant="secondary">暂无风险</Badge>
          )}
          {ticket.priority !== "normal" && (
            <Badge variant="outline">{ticket.priority === "critical" ? "高风险" : "需关注"}</Badge>
          )}
        </div>
      </div>
    </aside>
  );
}

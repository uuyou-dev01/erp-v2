import type { ProductTicket } from "@/lib/application/workflow-queries";
import { Badge } from "@/components/ui/badge";
import { ExceptionBadge } from "@/components/workbench/exception-badge";

export function ProductTicketHeader({ ticket }: { ticket: ProductTicket }) {
  return (
    <div className="border-b px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold tracking-tight">{ticket.title}</h2>
          </div>
          {ticket.subtitle && <p className="mt-1 text-sm text-muted-foreground">{ticket.subtitle}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge variant={ticket.lifecycleStage === "EXCEPTION" ? "destructive" : "secondary"}>
            {ticket.lifecycleStageLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">{ticket.currentStatusLabel}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">{ticket.primaryActionLabel}</Badge>
        {ticket.platformText && <Badge variant="outline">{ticket.platformText}</Badge>}
        {ticket.profitStatus && <Badge variant="outline">{ticket.profitStatus}</Badge>}
        {ticket.exceptionMessage && <ExceptionBadge message={ticket.exceptionMessage} />}
      </div>
    </div>
  );
}

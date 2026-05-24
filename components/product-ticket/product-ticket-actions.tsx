"use client";

import type { ProductTicket } from "@/lib/application/workflow-queries";
import { PendingActionPanel } from "@/components/workbench/pending-action-panel";

export function ProductTicketActions({
  ticket,
  onComplete,
}: {
  ticket: ProductTicket;
  onComplete?: () => void;
}) {
  return (
    <div className="rounded-lg border">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">下一步动作</h3>
      </div>
      <PendingActionPanel detail={ticket.workItemDetail} onComplete={onComplete} />
    </div>
  );
}

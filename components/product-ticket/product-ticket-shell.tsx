"use client";

import type { ProductTicket } from "@/lib/application/workflow-queries";
import { ProductTicketHeader } from "./product-ticket-header";
import { ProductTicketTimeline } from "./product-ticket-timeline";
import { ProductTicketSidebar } from "./product-ticket-sidebar";
import { ActivityTimeline } from "./activity-timeline";
import { PendingActionPanel } from "@/components/workbench/pending-action-panel";
import type { WorkbenchPlatformOption } from "@/components/workbench/action-drawer-forms";

interface ProductTicketShellProps {
  ticket: ProductTicket;
  platforms?: WorkbenchPlatformOption[];
  onComplete?: () => void;
  onClose?: () => void;
  compact?: boolean;
}

export function ProductTicketShell({
  ticket,
  platforms = [],
  onComplete,
  onClose,
  compact,
}: ProductTicketShellProps) {
  return (
    <div className="flex h-full flex-col">
      <ProductTicketHeader ticket={ticket} />
      <div className="grid flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="space-y-6 p-5">
          <ProductTicketTimeline ticket={ticket} />
          {!compact && (
            <section className="rounded-lg border p-4">
              <h3 className="mb-3 text-sm font-semibold">操作记录</h3>
              <ActivityTimeline activities={ticket.activity} />
            </section>
          )}
        </main>
        <aside className="space-y-4 border-l bg-muted/20 p-5">
          <ProductTicketSidebar ticket={ticket} />
          <div className="overflow-hidden rounded-lg border bg-background">
            <PendingActionPanel
              detail={ticket.workItemDetail}
              platforms={platforms}
              onClose={onClose}
              onComplete={onComplete}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

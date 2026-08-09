"use client";

import type { ProductTicket } from "@/lib/application/workflow-queries";
import { ProductTicketHeader } from "./product-ticket-header";
import { ProductTicketTimeline } from "./product-ticket-timeline";
import { ProductTicketSidebar } from "./product-ticket-sidebar";
import { ActivityTimeline } from "./activity-timeline";
import { PendingActionPanel } from "@/components/workbench/pending-action-panel";
import type { WorkbenchPlatformOption } from "@/components/workbench/action-drawer-forms";
import { LifecycleTimeline } from "@/components/workbench/lifecycle-timeline";
import { ShipmentTimeline } from "@/components/workbench/shipment-timeline";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, MapPin } from "lucide-react";

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
  if (compact) {
    const activeProcess =
      ticket.subProcesses.find((process) => process.status === "blocked") ?? ticket.subProcesses[0];

    return (
      <div className="grid overflow-hidden rounded-lg border bg-background lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="p-5 lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">当前进度</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {ticket.currentStatusLabel}
              </h2>
            </div>
            <Badge variant={ticket.lifecycleStage === "EXCEPTION" ? "destructive" : "secondary"}>
              {ticket.lifecycleStageLabel}
            </Badge>
          </div>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {ticket.locationText ? (
              <p className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                {ticket.locationText}
              </p>
            ) : null}
            {activeProcess ? (
              <p>
                <span className="font-medium text-foreground">{activeProcess.label}</span>
                <span className="mx-1.5 text-border">/</span>
                {activeProcess.currentStep}
              </p>
            ) : null}
          </div>

          {ticket.exceptionMessage ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {ticket.exceptionMessage}
            </div>
          ) : null}

          <details className="group mt-6 border-t pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium hover:text-primary [&::-webkit-details-marker]:hidden">
              查看完整流转履历
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-5 max-w-2xl">
              <LifecycleTimeline events={ticket.lifecycle} />
              {ticket.shipments.length > 0 ? (
                <div className="mt-2 border-t pt-5">
                  <h3 className="mb-3 text-sm font-semibold">物流流转</h3>
                  <ShipmentTimeline legs={ticket.shipments} />
                </div>
              ) : null}
            </div>
          </details>
        </section>

        <aside className="border-t bg-muted/15 lg:border-l lg:border-t-0">
          <PendingActionPanel
            detail={ticket.workItemDetail}
            platforms={platforms}
            onClose={onClose}
            onComplete={onComplete}
            compact
          />
        </aside>
      </div>
    );
  }

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

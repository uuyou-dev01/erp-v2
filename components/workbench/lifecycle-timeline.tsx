import { cn } from "@/lib/utils";
import type { LifecycleEvent } from "@/lib/application/next-actions";
import { CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";

interface LifecycleTimelineProps {
  events: LifecycleEvent[];
  className?: string;
}

function StatusIcon({ status }: { status: LifecycleEvent["status"] }) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "current") return <CircleDot className="h-4 w-4 text-blue-500" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Circle className="h-4 w-4 text-muted-foreground/40" />;
}

export function LifecycleTimeline({ events, className }: LifecycleTimelineProps) {
  return (
    <div className={cn("space-y-0", className)}>
      {events.map((event, index) => (
        <div key={event.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <StatusIcon status={event.status} />
            {index < events.length - 1 && <div className="my-1 min-h-[20px] w-px flex-1 bg-border" />}
          </div>
          <div className="pb-4">
            <p className={cn("text-sm font-medium", event.status === "current" && "text-blue-600")}>
              {event.label}
            </p>
            {event.timestamp && (
              <p className="text-xs text-muted-foreground">
                {new Date(event.timestamp).toLocaleString("zh-CN")}
              </p>
            )}
            {event.description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{event.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

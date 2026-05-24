import type { ProductTicketActivity } from "@/lib/application/workflow-queries";
import { Clock } from "lucide-react";

export function ActivityTimeline({ activities }: { activities: ProductTicketActivity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无操作记录</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex gap-3">
          <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{activity.label}</p>
            <p className="text-xs text-muted-foreground">{activity.description}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {new Date(activity.timestamp).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

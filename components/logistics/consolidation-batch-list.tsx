import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface Batch {
  id: string;
  status: string;
  outboundTrackingNo: string | null;
  carrier: string | null;
  updatedAt: Date;
  lines: Array<{ id: string }>;
  fromLocation?: { name: string } | null;
  toLocation?: { name: string } | null;
}

export function ConsolidationBatchList({ batches }: { batches: Batch[] }) {
  if (batches.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">暂无集运批次</p>;
  }
  return (
    <div className="divide-y rounded-lg border">
      {batches.map((batch) => (
        <Link
          key={batch.id}
          href={`/logistics/consolidations/${batch.id}`}
          className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40"
        >
          <div className="min-w-0">
            <p className="font-medium">集运批次 {batch.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground">
              {[batch.fromLocation?.name, batch.toLocation?.name].filter(Boolean).join(" → ") || "未设置路线"}
              {" · "}
              {batch.lines.length} 件
            </p>
          </div>
          <div className="flex items-center gap-2">
            {batch.outboundTrackingNo && <span className="font-mono text-xs text-muted-foreground">{batch.outboundTrackingNo}</span>}
            <Badge variant="outline">{batch.status}</Badge>
          </div>
        </Link>
      ))}
    </div>
  );
}

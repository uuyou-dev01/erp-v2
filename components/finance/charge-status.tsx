import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待付款方确认",
  CONFIRMED: "已确认待结清",
  DISPUTED: "有争议",
  PARTIALLY_SETTLED: "部分线下结清",
  SETTLED: "已线下结清",
  VOID: "已冲销",
};

export function ChargeStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === "SETTLED"
          ? "default"
          : status === "DISPUTED" || status === "VOID"
            ? "destructive"
            : "secondary"
      }
    >
      {labels[status] ?? status}
    </Badge>
  );
}

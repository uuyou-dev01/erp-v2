import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  PAID: "已线下结清",
  VOID: "已作废",
};

export function SettlementStatusBadge({ status }: { status: string }) {
  const variant = status === "PAID" ? "default" : status === "VOID" ? "destructive" : "secondary";
  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

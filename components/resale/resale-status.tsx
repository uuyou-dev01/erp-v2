import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  ACTIVE: "代卖中",
  PAUSED: "已暂停",
  SOLD_OUT: "已售完",
  DELISTED: "已下架",
};

export function ResaleStatusBadge({ status }: { status: string }) {
  const variant = status === "ACTIVE" ? "default" : status === "DELISTED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{statusLabels[status] ?? status}</Badge>;
}

export function resaleStatusLabel(status: string) {
  return statusLabels[status] ?? status;
}

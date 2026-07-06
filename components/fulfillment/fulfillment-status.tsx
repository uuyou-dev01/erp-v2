import { Badge } from "@/components/ui/badge";

const labels: Record<string, string> = {
  REQUESTED: "已请求",
  ACCEPTED: "已接受",
  REJECTED: "已拒绝",
  SHIPPED: "已发货",
  DELIVERED: "已送达",
  CANCELLED: "已取消",
  EXCEPTION: "异常",
};

export function FulfillmentStatusBadge({ status }: { status: string }) {
  const variant =
    status === "SHIPPED" || status === "DELIVERED"
      ? "default"
      : status === "REJECTED" || status === "CANCELLED" || status === "EXCEPTION"
        ? "destructive"
        : "secondary";

  return <Badge variant={variant}>{labels[status] ?? status}</Badge>;
}

export function fulfillmentStatusLabel(status: string) {
  return labels[status] ?? status;
}

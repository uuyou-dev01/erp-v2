import { Badge } from "@/components/ui/badge";

const statusLabels: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  PAUSED: "已暂停",
  DELISTED: "已下架",
};

const visibilityLabels: Record<string, string> = {
  PRIVATE: "私有",
  PARTNER_ONLY: "合作方可见",
  PUBLIC: "公开",
};

export function SupplyOfferStatusBadge({ status }: { status: string }) {
  const variant = status === "PUBLISHED" ? "default" : status === "DELISTED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{statusLabels[status] ?? status}</Badge>;
}

export function SupplyOfferVisibilityBadge({ visibility }: { visibility: string }) {
  return <Badge variant="outline">{visibilityLabels[visibility] ?? visibility}</Badge>;
}

export function supplyOfferStatusLabel(status: string) {
  return statusLabels[status] ?? status;
}

export function supplyOfferVisibilityLabel(visibility: string) {
  return visibilityLabels[visibility] ?? visibility;
}

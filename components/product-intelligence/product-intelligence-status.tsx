import { Badge } from "@/components/ui/badge";

const visibilityLabels: Record<string, string> = {
  PUBLIC: "公开",
  ORGANIZATION: "组织内",
  PRIVATE: "仅自己",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "展示中",
  HIDDEN: "隐藏",
  ARCHIVED: "归档",
};

const confidenceLabels: Record<string, string> = {
  LOW: "低可信",
  MEDIUM: "中可信",
  HIGH: "高可信",
};

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return <Badge variant={visibility === "PUBLIC" ? "default" : "outline"}>{visibilityLabels[visibility] ?? visibility}</Badge>;
}

export function IntelligenceStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "ACTIVE" ? "default" : "secondary"}>{statusLabels[status] ?? status}</Badge>;
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  return <Badge variant={confidence === "HIGH" ? "default" : "outline"}>{confidenceLabels[confidence] ?? confidence}</Badge>;
}

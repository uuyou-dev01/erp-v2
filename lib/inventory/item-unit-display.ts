export const itemUnitStatusLabels: Record<string, string> = {
  AVAILABLE: "可用",
  CONSOLIDATING: "转运锁定",
  ALLOCATED: "已分配",
  CONSUMED: "已消耗",
  RETURN_CHECK: "待检查 / 补资料",
  RETURN_TO_SUPPLIER: "退供应商",
};

import { usedItemGradeLabel } from "@/lib/inventory/item-condition";

export function formatItemUnitCondition(grade: string | null | undefined): string {
  if (!grade) return "-";
  return usedItemGradeLabel(grade);
}

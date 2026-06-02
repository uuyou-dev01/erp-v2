export const itemUnitStatusLabels: Record<string, string> = {
  AVAILABLE: "可用",
  ALLOCATED: "已分配",
  CONSUMED: "已消耗",
  RETURN_CHECK: "退货检查",
};

export const itemUnitConditionLabels: Record<string, string> = {
  NEW: "全新",
  LIKE_NEW: "准新",
  EXCELLENT: "优秀",
  GOOD: "良好",
  FAIR: "一般",
  POOR: "较差",
  DEFECTIVE: "有缺陷",
};

export function formatItemUnitCondition(grade: string | null | undefined): string {
  if (!grade) return "-";
  return itemUnitConditionLabels[grade] ?? grade;
}

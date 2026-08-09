export const ITEM_CONDITION_TYPES = ["NEW", "USED"] as const;
export type ItemConditionType = (typeof ITEM_CONDITION_TYPES)[number];

export const USED_ITEM_GRADES = ["S", "A", "B", "C", "D", "UNASSESSED"] as const;
export type UsedItemGrade = (typeof USED_ITEM_GRADES)[number];

export const ITEM_FUNCTION_STATUSES = ["NORMAL", "ISSUE", "UNTESTED"] as const;
export type ItemFunctionStatus = (typeof ITEM_FUNCTION_STATUSES)[number];

export const usedItemGradeOptions: Array<{
  value: UsedItemGrade;
  label: string;
  description: string;
}> = [
  { value: "S", label: "S", description: "接近全新，几乎无使用痕迹" },
  { value: "A", label: "A", description: "轻微使用痕迹，无明显瑕疵" },
  { value: "B", label: "B", description: "有可见使用痕迹或轻微瑕疵" },
  { value: "C", label: "C", description: "明显磨损、缺件或轻微使用问题" },
  { value: "D", label: "D", description: "严重瑕疵、功能异常或维修配件品" },
  { value: "UNASSESSED", label: "待评级", description: "尚未完成检查，不可直接上架" },
];

export const itemFunctionStatusOptions: Array<{
  value: ItemFunctionStatus;
  label: string;
}> = [
  { value: "NORMAL", label: "正常" },
  { value: "ISSUE", label: "有异常" },
  { value: "UNTESTED", label: "未测试" },
];

const LEGACY_GRADE_MAP: Record<string, UsedItemGrade> = {
  LIKE_NEW: "S",
  EXCELLENT: "A",
  GOOD: "B",
  FAIR: "C",
  POOR: "D",
  DEFECTIVE: "D",
  USED: "UNASSESSED",
  中古: "UNASSESSED",
  二手: "UNASSESSED",
};

export function normalizeItemConditionType(value: string | null | undefined): ItemConditionType {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "NEW" || normalized === "新品" || normalized === "全新") {
    return "NEW";
  }
  return "USED";
}

export function normalizeUsedItemGrade(value: string | null | undefined): UsedItemGrade | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || normalized === "NEW" || normalized === "新品" || normalized === "全新") {
    return null;
  }
  if (USED_ITEM_GRADES.includes(normalized as UsedItemGrade)) {
    return normalized as UsedItemGrade;
  }
  return LEGACY_GRADE_MAP[normalized] ?? "UNASSESSED";
}

export function normalizeItemFunctionStatus(
  value: string | null | undefined,
  conditionType: ItemConditionType
): ItemFunctionStatus {
  const normalized = value?.trim().toUpperCase();
  if (ITEM_FUNCTION_STATUSES.includes(normalized as ItemFunctionStatus)) {
    return normalized as ItemFunctionStatus;
  }
  return conditionType === "NEW" ? "NORMAL" : "UNTESTED";
}

export function itemConditionTypeLabel(value: string | null | undefined) {
  return normalizeItemConditionType(value) === "NEW" ? "全新" : "中古";
}

export function usedItemGradeLabel(value: string | null | undefined) {
  const grade = normalizeUsedItemGrade(value);
  return grade === "UNASSESSED" || !grade ? "待评级" : `${grade} 级`;
}

export function itemFunctionStatusLabel(value: string | null | undefined) {
  return itemFunctionStatusOptions.find((option) => option.value === value)?.label ?? "未测试";
}

export function itemRequiresIssueEvidence(input: {
  conditionType?: string | null;
  conditionGrade?: string | null;
  functionStatus?: string | null;
}) {
  if (normalizeItemConditionType(input.conditionType) !== "USED") return false;
  const grade = normalizeUsedItemGrade(input.conditionGrade);
  return grade === "C" || grade === "D" || input.functionStatus === "ISSUE";
}

export function validateItemCondition(input: {
  conditionType?: string | null;
  conditionGrade?: string | null;
  functionStatus?: string | null;
  notes?: string | null;
  photoCount?: number;
}) {
  const conditionType = normalizeItemConditionType(input.conditionType);
  if (conditionType === "NEW") return null;

  const grade = normalizeUsedItemGrade(input.conditionGrade);
  if (!grade) return "中古单件必须选择 S、A、B、C、D 或待评级";
  if (!ITEM_FUNCTION_STATUSES.includes(input.functionStatus as ItemFunctionStatus)) {
    return "中古单件必须确认功能状态";
  }
  if (itemRequiresIssueEvidence(input) && !input.notes?.trim()) {
    return "C/D 级或功能异常的单件必须填写瑕疵或异常说明";
  }
  if (itemRequiresIssueEvidence(input) && input.photoCount !== undefined && input.photoCount < 1) {
    return "C/D 级或功能异常的单件至少需要一张实物或瑕疵图片";
  }
  return null;
}

export function itemConditionReadyForSale(input: {
  conditionType?: string | null;
  conditionGrade?: string | null;
  functionStatus?: string | null;
  notes?: string | null;
  photoCount?: number;
}) {
  const conditionType = normalizeItemConditionType(input.conditionType);
  if (conditionType === "NEW") return true;
  const grade = normalizeUsedItemGrade(input.conditionGrade);
  if (!grade || grade === "UNASSESSED" || input.functionStatus === "UNTESTED") return false;
  if (itemRequiresIssueEvidence(input)) {
    return Boolean(input.notes?.trim()) && (input.photoCount ?? 0) > 0;
  }
  return true;
}

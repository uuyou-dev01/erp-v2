export type BulkActionNotice = {
  tone: "success" | "error";
  message: string;
  shouldRefresh: boolean;
  shouldClearSelection: boolean;
};

type BulkActionCountResult = {
  success: number;
  failed: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isBulkActionCountResult(value: unknown): value is BulkActionCountResult {
  return (
    isRecord(value) &&
    typeof value.success === "number" &&
    typeof value.failed === "number"
  );
}

export function describeBulkActionResult(result: unknown): BulkActionNotice | null {
  if (!isBulkActionCountResult(result)) return null;

  const success = Math.max(0, result.success);
  const failed = Math.max(0, result.failed);

  if (success === 0 && failed === 0) {
    return {
      tone: "error",
      message: "没有可处理的记录。",
      shouldRefresh: false,
      shouldClearSelection: false,
    };
  }

  if (failed === 0) {
    return {
      tone: "success",
      message: `已处理 ${success} 项。`,
      shouldRefresh: true,
      shouldClearSelection: true,
    };
  }

  if (success > 0) {
    return {
      tone: "error",
      message: `已处理 ${success} 项，${failed} 项失败。请检查未完成的记录后重试。`,
      shouldRefresh: true,
      shouldClearSelection: false,
    };
  }

  return {
    tone: "error",
    message: `${failed} 项未能处理，请检查状态或必填信息后重试。`,
    shouldRefresh: false,
    shouldClearSelection: false,
  };
}

import { describe, expect, it } from "vitest";
import { describeBulkActionResult } from "@/lib/application/bulk-action-result";

describe("bulk action result descriptions", () => {
  it("treats all successful items as a success notice", () => {
    expect(describeBulkActionResult({ success: 3, failed: 0 })).toEqual({
      tone: "success",
      message: "已处理 3 项。",
      shouldRefresh: true,
      shouldClearSelection: true,
    });
  });

  it("keeps the selection and reports partial failures", () => {
    expect(describeBulkActionResult({ success: 2, failed: 1 })).toEqual({
      tone: "error",
      message: "已处理 2 项，1 项失败。请检查未完成的记录后重试。",
      shouldRefresh: true,
      shouldClearSelection: false,
    });
  });

  it("keeps the selection and reports complete failures", () => {
    expect(describeBulkActionResult({ success: 0, failed: 2 })).toEqual({
      tone: "error",
      message: "2 项未能处理，请检查状态或必填信息后重试。",
      shouldRefresh: false,
      shouldClearSelection: false,
    });
  });
});

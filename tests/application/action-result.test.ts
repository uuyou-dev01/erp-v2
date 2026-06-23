import { describe, expect, it } from "vitest";
import {
  actionFailure,
  actionSuccess,
  isActionFailure,
  toActionFailure,
} from "@/lib/application/action-result";

describe("action result helpers", () => {
  it("wraps success payloads with a success flag", () => {
    expect(actionSuccess({ id: "po_1" })).toEqual({ success: true, id: "po_1" });
  });

  it("keeps error messages from thrown errors", () => {
    expect(toActionFailure(new Error("请选择目的地仓库"))).toEqual({
      success: false,
      error: "请选择目的地仓库",
    });
  });

  it("uses fallback messages for unknown errors", () => {
    expect(toActionFailure("bad", "操作失败")).toEqual(actionFailure("操作失败"));
  });

  it("identifies structured server action failures from unknown results", () => {
    expect(isActionFailure({ success: false, error: "重试失败" })).toBe(true);
    expect(isActionFailure({ success: true, id: "entry_1" })).toBe(false);
    expect(isActionFailure({ success: false })).toBe(false);
  });
});

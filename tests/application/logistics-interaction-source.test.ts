import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("logistics interaction source hygiene", () => {
  it("uses structured inline errors for consolidation status changes", () => {
    const actionSource = readFileSync(join(process.cwd(), "app/actions/consolidations.ts"), "utf8");
    const componentSource = readFileSync(
      join(process.cwd(), "components/logistics/consolidation-batch-detail.tsx"),
      "utf8"
    );

    expect(actionSource).toContain("export async function updateConsolidationStatusAction");
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");

    expect(componentSource).toContain("updateConsolidationStatusAction");
    expect(componentSource).not.toContain("updateConsolidationStatus(batch.id");
    expect(componentSource).toContain("statusError");
    expect(componentSource).toContain('role="alert"');
  });
});

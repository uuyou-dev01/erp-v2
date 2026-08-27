import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("platform creation return navigation source", () => {
  it("passes a safe return target into the form and returns with the created platform id", () => {
    const page = readFileSync(
      join(process.cwd(), "app/(dashboard)/listing/platforms/new/page.tsx"),
      "utf8"
    );
    const form = readFileSync(join(process.cwd(), "components/listing/platform-form.tsx"), "utf8");

    expect(page).toContain("safeInternalReturnPath(returnTo)");
    expect(page).toContain("returnTo={safeReturnTo}");
    expect(form).toContain('returnPathWithCreatedId(returnTo, "createdPlatformId", result.id)');
  });
});

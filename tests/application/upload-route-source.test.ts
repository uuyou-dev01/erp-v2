import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("upload API source hygiene", () => {
  it("does not log expected upload failures as console errors", () => {
    const source = readFileSync(join(process.cwd(), "app/api/upload/route.ts"), "utf8");

    expect(source).not.toMatch(/\bconsole\.error\(/);
  });
});

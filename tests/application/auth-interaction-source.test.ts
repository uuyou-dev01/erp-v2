import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth interaction source hygiene", () => {
  it("keeps login switch-user failures inline instead of throwing from a form action", () => {
    const pageSource = readFileSync(join(process.cwd(), "app/(auth)/login/page.tsx"), "utf8");
    const actionSource = readFileSync(join(process.cwd(), "app/actions/session.ts"), "utf8");
    const formSource = readFileSync(
      join(process.cwd(), "components/auth/login-user-form.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("<LoginUserForm");
    expect(pageSource).not.toContain("action={switchCurrentUser}");

    expect(actionSource).toContain("export async function switchCurrentUserAction");
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");
    expect(actionSource).toContain('requestedNext?.startsWith("/collaboration/tasks")');

    expect(formSource).toContain("switchCurrentUserAction");
    expect(formSource).toContain("loginError");
    expect(formSource).toContain('role="alert"');
  });
});

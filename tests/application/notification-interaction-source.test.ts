import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification interaction source hygiene", () => {
  it("uses structured inline errors when marking notifications read", () => {
    const actionSource = readFileSync(join(process.cwd(), "app/actions/notifications.ts"), "utf8");
    const listSource = readFileSync(
      join(process.cwd(), "components/notifications/notification-list.tsx"),
      "utf8"
    );

    expect(actionSource).toContain("export async function markMyNotificationReadAction");
    expect(actionSource).toContain("return actionSuccess");
    expect(actionSource).toContain("return toActionFailure");

    expect(listSource).toContain("markMyNotificationReadAction");
    expect(listSource).not.toMatch(/await markMyNotificationRead\(/);
    expect(listSource).toContain("notificationError");
    expect(listSource).toContain('role="alert"');
  });
});

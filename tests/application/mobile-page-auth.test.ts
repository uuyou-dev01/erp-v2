import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
  requireUserContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: authMocks.redirect }));
vi.mock("@/lib/auth/user-context", () => ({
  requireUserContext: authMocks.requireUserContext,
}));

import { requireMobilePageContext } from "@/lib/mobile/page-auth";

describe("mobile page authentication", () => {
  beforeEach(() => {
    authMocks.redirect.mockReset();
    authMocks.requireUserContext.mockReset();
    authMocks.redirect.mockImplementation((path: string) => {
      throw new Error(`redirect:${path}`);
    });
  });

  it("returns the authenticated context without redirecting", async () => {
    const context = { userId: "user_1", activeStoreId: "store_1" };
    authMocks.requireUserContext.mockResolvedValue(context);

    await expect(requireMobilePageContext("/m/tasks")).resolves.toBe(context);
    expect(authMocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects an invalid session before mobile page data is loaded", async () => {
    authMocks.requireUserContext.mockRejectedValue(new Error("请先登录"));

    await expect(requireMobilePageContext("/m/capture/purchase")).rejects.toThrow(
      "redirect:/login?next=%2Fm%2Fcapture%2Fpurchase",
    );
    expect(authMocks.redirect).toHaveBeenCalledOnce();
  });

  it("keeps authentication out of the concurrently rendered mobile layout", () => {
    const layoutSource = readFileSync(
      join(process.cwd(), "app/(mobile)/m/layout.tsx"),
      "utf8",
    );

    expect(layoutSource).not.toContain("requireUserContext");
    expect(layoutSource).not.toContain("redirect(");
  });
});

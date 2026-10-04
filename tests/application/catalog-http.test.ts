import { describe, expect, it } from "vitest";
import {
  assertCatalogOrigin,
  readCatalogJson,
  catalogErrorResponse,
  CatalogError,
} from "@/lib/catalog/http";

describe("catalog HTTP boundary", () => {
  it("accepts JSON and rejects cross-origin writes and non-JSON bodies", async () => {
    expect(
      await readCatalogJson(
        new Request("http://localhost/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"x":1}',
        })
      )
    ).toEqual({ x: 1 });
    expect(() =>
      assertCatalogOrigin(
        new Request("http://localhost/api", { headers: { origin: "https://attacker.example" } })
      )
    ).toThrow("来源");
    await expect(
      readCatalogJson(new Request("http://localhost/api", { method: "POST", body: "{}" }))
    ).rejects.toMatchObject({ status: 415 });
  });
  it("bounds actual body bytes even without content-length", async () => {
    await expect(
      readCatalogJson(
        new Request("http://localhost/api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '"123456789"',
        }),
        5
      )
    ).rejects.toMatchObject({ status: 413 });
  });
  it("returns machine-readable auth and conflict errors", async () => {
    expect(catalogErrorResponse(new Error("请先登录")).status).toBe(401);
    expect(catalogErrorResponse(new Error("无权访问该店铺")).status).toBe(403);
    const response = catalogErrorResponse(new CatalogError("IMPORT_CONFLICT", "内容不同", 409));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "IMPORT_CONFLICT" },
    });
  });
});

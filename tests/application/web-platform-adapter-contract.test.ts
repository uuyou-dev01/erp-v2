import { describe, expect, it } from "vitest";
import { listWebPlatformContentAdapters } from "@/lib/capture/web-platform-adapters/registry";
import { buildWebLinkPreview, type WebLinkDocument } from "@/lib/capture/web-link-parser";
import mercariShopsSoldOut from "@/tests/fixtures/web-link/mercari-shops-sold-out.json";

describe("web platform adapter contract", () => {
  it("keeps adapter codes unique and metadata usable for health reporting", () => {
    const adapters = listWebPlatformContentAdapters();
    expect(new Set(adapters.map((adapter) => adapter.code)).size).toBe(adapters.length);
    for (const adapter of adapters) {
      expect(adapter.version).toMatch(/^\d+$/);
      expect(adapter.variants.length).toBeGreaterThan(0);
      expect(adapter.capabilities.length).toBeGreaterThan(0);
    }
  });

  it("keeps every extraction claim within the confidence contract", () => {
    const preview = buildWebLinkPreview(mercariShopsSoldOut as WebLinkDocument);
    expect(preview.extractionClaims.length).toBeGreaterThan(0);
    for (const claim of preview.extractionClaims) {
      expect(claim.confidence).toBeGreaterThanOrEqual(0);
      expect(claim.confidence).toBeLessThanOrEqual(1);
      expect(claim.source).toMatch(/^[A-Z_]+$/);
    }
  });
});

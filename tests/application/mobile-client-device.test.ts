import { afterEach, describe, expect, it, vi } from "vitest";
import { createInstallationId } from "@/lib/mobile/client-device";

describe("mobile client device identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a UUID when randomUUID is unavailable on an HTTP origin", () => {
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        bytes.fill(0x2a);
        return bytes;
      },
    });

    expect(createInstallationId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

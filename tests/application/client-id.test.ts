import { describe, expect, it } from "vitest";
import { createClientId } from "@/lib/client-id";

describe("createClientId", () => {
  it("uses randomUUID when the secure-context API is available", () => {
    expect(
      createClientId("request", {
        randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
      })
    ).toBe("request:123e4567-e89b-42d3-a456-426614174000");
  });

  it("falls back to a UUID-shaped id when randomUUID is unavailable", () => {
    const id = createClientId(undefined, null);

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });
});

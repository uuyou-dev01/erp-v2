import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createInvitationToken,
  createPublicCode,
  hashInvitationToken,
} from "@/lib/auth/invitation-token";

describe("account and organization collaboration foundation", () => {
  it("creates non-ambiguous public collaboration codes", () => {
    for (let index = 0; index < 100; index += 1) {
      const code = createPublicCode("ORG", 6);
      expect(code).toMatch(/^ORG-[23456789A-HJ-NP-Z]{6}$/);
      expect(code.slice(4)).not.toMatch(/[01IO]/);
    }
  });

  it("stores only a stable hash of invitation tokens", () => {
    const token = createInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashInvitationToken(token)).toHaveLength(64);
    expect(hashInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(hashInvitationToken(createInvitationToken())).not.toBe(hashInvitationToken(token));
  });

  it("keeps registration and business membership separate", () => {
    const sessionSource = readFileSync(join(process.cwd(), "app/actions/session.ts"), "utf8");
    const contextSource = readFileSync(join(process.cwd(), "lib/auth/user-context.ts"), "utf8");
    expect(sessionSource).toContain("registerAccountAction");
    expect(sessionSource).toContain("storeId: null");
    expect(contextSource).toContain("requireAuthenticatedUser");
    expect(contextSource).toContain("当前用户没有有效主体成员身份");
  });

  it("does not directly bind a partner from a typed organization code", () => {
    const partnerSource = readFileSync(join(process.cwd(), "app/actions/partners.ts"), "utf8");
    const connectionSource = readFileSync(
      join(process.cwd(), "app/actions/organization-connections.ts"),
      "utf8"
    );
    expect(partnerSource).not.toContain("resolveLinkedOrganizationId");
    expect(connectionSource).toContain("respondOrganizationConnectionAction");
    expect(connectionSource).toContain('status: accepted ? "ACTIVE" : "REJECTED"');
  });
});

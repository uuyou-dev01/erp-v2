import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capabilitiesForLocationFulfillerRole,
  COLLABORATION_CAPABILITY,
} from "@/lib/application/collaboration-capabilities";
import { resolveCollaborationResponseTransition } from "@/lib/application/collaboration-protocol";

describe("generic collaboration protocol foundation", () => {
  it("maps warehouse roster roles to centralized capabilities", () => {
    expect(capabilitiesForLocationFulfillerRole("MANAGER")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
      COLLABORATION_CAPABILITY.WAREHOUSE_MANAGE,
    ]);
    expect(capabilitiesForLocationFulfillerRole("OPERATOR")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
    ]);
    expect(capabilitiesForLocationFulfillerRole("BACKUP")).toEqual([
      COLLABORATION_CAPABILITY.WAREHOUSE_SHIP,
    ]);
    expect(capabilitiesForLocationFulfillerRole("VIEWER")).toEqual([]);
  });

  it("keeps individual FIRST_ACCEPT rejection open but lets the target scope reject overall", () => {
    expect(
      resolveCollaborationResponseTransition({
        acceptancePolicy: "FIRST_ACCEPT",
        decision: "REJECT",
        responderIsTargetScope: false,
      })
    ).toBeNull();
    expect(
      resolveCollaborationResponseTransition({
        acceptancePolicy: "FIRST_ACCEPT",
        decision: "ACCEPT",
        responderIsTargetScope: false,
      })
    ).toBe("ACCEPTED");
    expect(
      resolveCollaborationResponseTransition({
        acceptancePolicy: "FIRST_ACCEPT",
        decision: "REJECT",
        responderIsTargetScope: true,
      })
    ).toBe("REJECTED");
  });

  it("distinguishes direct acceptance from authorized approval", () => {
    expect(
      resolveCollaborationResponseTransition({
        acceptancePolicy: "DIRECT_ACCEPT",
        decision: "ACCEPT",
        responderIsTargetScope: true,
      })
    ).toBe("ACCEPTED");
    expect(
      resolveCollaborationResponseTransition({
        acceptancePolicy: "AUTHORIZED_APPROVAL",
        decision: "APPROVE",
        responderIsTargetScope: true,
      })
    ).toBe("ACCEPTED");
    expect(() =>
      resolveCollaborationResponseTransition({
        acceptancePolicy: "AUTHORIZED_APPROVAL",
        decision: "ACCEPT",
        responderIsTargetScope: true,
      })
    ).toThrow("AUTHORIZED_APPROVAL");
  });

  it("declares scoped requests, idempotent responses, append-only events, and one-to-one task dispatch", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260817110000_collaboration_protocol_foundation/migration.sql"
      ),
      "utf8"
    );

    for (const model of [
      "CollaborationRequest",
      "CollaborationResponse",
      "CollaborationEvent",
      "TaskDispatch",
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
    for (const scope of ["ORGANIZATION", "LOCATION", "ROLE", "USER"]) {
      expect(schema).toContain(scope);
    }
    for (const status of ["OPEN", "WITHDRAWN", "ACCEPTED", "CANCELLED", "CLOSED"]) {
      expect(schema).toContain(status);
      expect(migration).toContain(`'${status}'`);
    }
    expect(schema).toContain("@@unique([requestId, idempotencyKey])");
    expect(schema).toContain("@@index([requestId, responderScopeType, responderScopeRef])");
    expect(schema).toMatch(/taskId\s+String\?\s+@unique/);
    expect(schema).toMatch(/dispatch\s+TaskDispatch\?/);
    const notification = schema.slice(
      schema.indexOf("model Notification {"),
      schema.indexOf("model NotificationPreference {")
    );
    expect(notification).toContain("resolvedAt     DateTime?");
    expect(notification).toContain("resolutionCode String?");
    expect(notification).toContain("resolvedById   String?");
    expect(notification).toContain("updatedAt      DateTime  @updatedAt");
    expect(notification).toContain("@@index([resolvedAt])");
  });

  it("exposes transaction-client protocol and ship-order dispatch interfaces", () => {
    const protocol = readFileSync(
      join(process.cwd(), "lib/application/collaboration-protocol.ts"),
      "utf8"
    );
    const shipping = readFileSync(
      join(process.cwd(), "lib/application/collaboration-protocol-shipping.ts"),
      "utf8"
    );

    expect(protocol).toContain("Prisma.TransactionClient");
    expect(protocol).toContain("createCollaborationRequest");
    expect(protocol).toContain("respondToCollaborationRequest");
    expect(protocol).toContain("createTaskDispatch");
    expect(protocol).toContain("claimTaskDispatch");
    expect(protocol).toContain("client.collaborationResponse.upsert");
    expect(protocol).toContain('decision: "ACCEPT"');
    expect(protocol).toContain("await closeCollaborationRequest(client");
    expect(protocol).toContain("withdrawCollaborationRequest");
    expect(protocol).toContain("cancelAcceptedCollaborationRequest");
    expect(protocol).toContain("closeCollaborationRequest");
    expect(shipping).toContain("createShipOrderDispatch");
    expect(shipping).toContain("WAREHOUSE_SHIP");
    expect(shipping).toContain('kind: "SHIP_ORDER"');
  });
});

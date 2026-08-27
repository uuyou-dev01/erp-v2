import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("collaboration production source contracts", () => {
  it("keeps organization connection history append-only", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260828090000_auth_connection_production/migration.sql"
      ),
      "utf8"
    );
    const action = readFileSync(
      join(process.cwd(), "app/actions/organization-connections.ts"),
      "utf8"
    );
    expect(schema).toContain("model OrganizationConnectionEvent");
    expect(migration).toContain("organization_connection_events_append_only");
    expect(migration).toContain("migration-backfill");
    for (const eventType of ["REQUESTED", "REOPENED", "ACCEPTED", "REJECTED", "ENDED"]) {
      expect(action).toContain(`\"${eventType}\"`);
    }
    expect(action).toContain("organizationConnectionEvent.create");
  });

  it("defines recipient, deep-link and dedupe contracts for collaboration outcomes", () => {
    const sources = [
      "app/actions/organization-connections.ts",
      "app/actions/multi-party.ts",
      "app/actions/supply-offers.ts",
      "app/actions/fulfillment-requests.ts",
      "app/actions/settlements.ts",
      "app/actions/team.ts",
      "app/actions/organization-invitations.ts",
    ]
      .map((file) => readFileSync(join(process.cwd(), file), "utf8"))
      .join("\n");
    for (const type of [
      "ORGANIZATION_CONNECTION_ACCEPTED",
      "ORGANIZATION_CONNECTION_REJECTED",
      "ORGANIZATION_CONNECTION_ENDED",
      "SERVICE_AGREEMENT_PROPOSED",
      "SERVICE_AGREEMENT_ACCEPTED",
      "SERVICE_AGREEMENT_RESUMED",
      "SERVICE_AGREEMENT_REVISION_PROPOSED",
      "SERVICE_AGREEMENT_PAUSED",
      "SERVICE_AGREEMENT_ENDED",
      "SUPPLY_OFFER_STATUS_CHANGED",
      "FULFILLMENT_REQUESTED",
      "FULFILLMENT_STATUS_CHANGED",
      "SETTLEMENT_STATUS_CHANGED",
      "MEMBERSHIP_ACCESS_CHANGED",
      "MEMBERSHIP_DEACTIVATED",
      "MEMBERSHIP_INVITATION_ACCEPTED",
    ]) {
      expect(sources).toContain(type);
    }
    expect(sources).toContain("actionUrl:");
    expect(sources).toContain("dedupeKey:");
  });
});

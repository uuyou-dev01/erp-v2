import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agreementCounterpartOrganizationId,
  assertCanConfirmServiceAgreement,
  canEndServiceAgreement,
  canReviseServiceAgreement,
  normalizeServiceAgreementTypes,
} from "@/lib/application/service-agreement-lifecycle";

describe("service agreement lifecycle contracts", () => {
  it("enforces participant, lifecycle and counterpart confirmation rules", () => {
    expect(
      agreementCounterpartOrganizationId({
        clientOrganizationId: "client",
        providerOrganizationId: "provider",
        currentOrganizationId: "client",
      })
    ).toBe("provider");
    expect(() =>
      agreementCounterpartOrganizationId({
        clientOrganizationId: "client",
        providerOrganizationId: "provider",
        currentOrganizationId: "outsider",
      })
    ).toThrow("不是协议参与方");
    expect(canEndServiceAgreement("PENDING_COUNTERPARTY")).toBe(true);
    expect(canEndServiceAgreement("ACTIVE")).toBe(true);
    expect(canEndServiceAgreement("PAUSED")).toBe(true);
    expect(canEndServiceAgreement("ENDED")).toBe(false);
    expect(canReviseServiceAgreement("ACTIVE")).toBe(true);
    expect(canReviseServiceAgreement("PAUSED")).toBe(true);
    expect(canReviseServiceAgreement("PENDING_COUNTERPARTY")).toBe(false);
    expect(() =>
      assertCanConfirmServiceAgreement({
        status: "PAUSED",
        currentOrganizationId: "client",
        pausedByOrganizationId: "client",
      })
    ).toThrow("必须由对方");
    expect(() =>
      assertCanConfirmServiceAgreement({
        status: "PAUSED",
        currentOrganizationId: "provider",
        pausedByOrganizationId: "client",
      })
    ).not.toThrow();
    expect(normalizeServiceAgreementTypes(["fulfillment", "FULFILLMENT", "return"]))
      .toEqual(["FULFILLMENT", "RETURN"]);
  });

  it("creates immutable revisions and exposes every lifecycle action in the UI", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20260828100000_service_agreement_lifecycle/migration.sql"
      ),
      "utf8"
    );
    const actions = readFileSync(join(process.cwd(), "app/actions/multi-party.ts"), "utf8");
    const ui = readFileSync(
      join(process.cwd(), "components/settings/business-structure-manager.tsx"),
      "utf8"
    );
    expect(schema).toContain("supersedesAgreementId");
    expect(schema).toContain('@relation("ServiceAgreementRevisions"');
    expect(migration).toContain("service_agreements_supersedesAgreementId_key");
    for (const action of [
      "activateServiceAgreementAction",
      "pauseServiceAgreementAction",
      "endServiceAgreementAction",
      "reviseServiceAgreementAction",
    ]) {
      expect(actions).toContain(`function ${action}`);
      expect(ui).toContain(action);
    }
    expect(actions).toContain("supersedesAgreementId: source.id");
    expect(actions).toContain("version: source.version + 1");
    expect(actions).toContain("SERVICE_AGREEMENT_REVISION_PROPOSED");
    expect(actions).toContain("SERVICE_AGREEMENT_PAUSED");
    expect(actions).toContain("SERVICE_AGREEMENT_RESUMED");
    expect(actions).toContain("SERVICE_AGREEMENT_ENDED");
  });

  it("makes repeated supply-offer state changes a no-op without updatedAt dedupe", () => {
    const source = readFileSync(join(process.cwd(), "app/actions/supply-offers.ts"), "utf8");
    expect(source).toContain("existing.status === nextStatus");
    expect(source).toContain("unchanged: true");
    expect(source).not.toContain("offer.updatedAt.getTime()");
  });
});

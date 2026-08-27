import { describe, expect, it } from "vitest";
import {
  childFirstDeleteOrder,
  DEFAULT_RETENTION_CUTOFF,
  deriveRetentionDecisions,
  hashStringList,
  normalizePolicy,
  type ForeignKeyEdge,
  type TableSnapshot,
} from "@/lib/data-retention/manifest";

const policy = {
  cutoff: DEFAULT_RETENTION_CUTOFF,
  ownerEmails: ["owner@example.com"],
  organizationIds: ["org_prod"],
  storeIds: ["store_prod"],
};

describe("data retention manifest", () => {
  it("normalizes and requires all production allowlists", () => {
    expect(normalizePolicy({ ...policy, ownerEmails: [" OWNER@example.com "] }).ownerEmails).toEqual([
      "owner@example.com",
    ]);
    expect(() => normalizePolicy({ ...policy, storeIds: [] })).toThrow(/均不能为空/);
  });

  it("retains recent rows, their old ancestors, and the ancestor's business children", () => {
    const snapshots: TableSnapshot[] = [
      { name: "organizations", hasCreatedAt: true, rows: [{ id: "org_prod", values: { id: "org_prod", createdAt: "2026-01-01T00:00:00Z" } }, { id: "org_test", values: { id: "org_test", createdAt: "2026-08-22T00:00:00Z" } }] },
      { name: "stores", hasCreatedAt: true, rows: [{ id: "store_prod", values: { id: "store_prod", organizationId: "org_prod", createdAt: "2026-01-01T00:00:00Z" } }, { id: "store_test", values: { id: "store_test", organizationId: "org_test", createdAt: "2026-08-22T00:00:00Z" } }] },
      { name: "users", hasCreatedAt: true, rows: [{ id: "owner", values: { id: "owner", email: "owner@example.com", storeId: "store_prod", createdAt: "2026-01-01T00:00:00Z" } }] },
      { name: "supply_offers", hasCreatedAt: true, rows: [{ id: "offer_old", values: { id: "offer_old", storeId: "store_prod", createdAt: "2026-01-02T00:00:00Z" } }, { id: "offer_delete", values: { id: "offer_delete", storeId: "store_prod", createdAt: "2026-01-02T00:00:00Z" } }, { id: "offer_e2e", values: { id: "offer_e2e", storeId: "store_prod", name: "E2E stress fixture", createdAt: "2026-08-22T00:00:00Z" } }, { id: "offer_other_org", values: { id: "offer_other_org", storeId: "store_test", createdAt: "2026-08-22T00:00:00Z" } }] },
      { name: "supply_offer_items", hasCreatedAt: true, rows: [{ id: "item_old", values: { id: "item_old", offerId: "offer_old", createdAt: "2026-01-03T00:00:00Z" } }] },
      { name: "fulfillment_requests", hasCreatedAt: true, rows: [{ id: "request_recent", values: { id: "request_recent", supplyOfferId: "offer_old", storeId: "store_prod", createdAt: "2026-08-22T00:00:00Z" } }] },
    ];
    const foreignKeys: ForeignKeyEdge[] = [
      { childTable: "stores", childColumns: ["organizationId"], parentTable: "organizations", parentColumns: ["id"] },
      { childTable: "users", childColumns: ["storeId"], parentTable: "stores", parentColumns: ["id"] },
      { childTable: "supply_offers", childColumns: ["storeId"], parentTable: "stores", parentColumns: ["id"] },
      { childTable: "supply_offer_items", childColumns: ["offerId"], parentTable: "supply_offers", parentColumns: ["id"] },
      { childTable: "fulfillment_requests", childColumns: ["supplyOfferId"], parentTable: "supply_offers", parentColumns: ["id"] },
    ];

    const decisions = deriveRetentionDecisions(snapshots, foreignKeys, policy);
    expect(decisions.find((item) => item.table === "supply_offers")?.deleteIds).toEqual([
      "offer_delete",
      "offer_e2e",
      "offer_other_org",
    ]);
    expect(decisions.find((item) => item.table === "supply_offer_items")?.keepCount).toBe(1);
  });

  it("orders child tables before their parents", () => {
    const fks: ForeignKeyEdge[] = [
      { childTable: "lines", childColumns: ["orderId"], parentTable: "orders", parentColumns: ["id"] },
    ];
    expect(childFirstDeleteOrder(["orders", "lines"], fks)).toEqual(["lines", "orders"]);
  });

  it("hashes ID sets independently of input order", () => {
    expect(hashStringList(["b", "a"])).toBe(hashStringList(["a", "b"]));
  });
});

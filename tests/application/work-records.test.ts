import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { recordWork } from "@/lib/application/work-records";
import { aggregateWorkMetrics } from "@/lib/application/work-metrics";

const runId = `work_records_${Date.now()}`;
let organizationId = "";
let storeId = "";
let userId = "";

describe("dynamic work records", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { code: `${runId}_ORG`, name: "Work Record Organization" },
    });
    organizationId = organization.id;
    const store = await prisma.store.create({
      data: { organizationId, code: `${runId}_STORE`, name: "Work Record Store" },
    });
    storeId = store.id;
    const user = await prisma.user.create({
      data: { email: `${runId}@example.com`, password: "test", role: "FULFILLMENT", storeId },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (organizationId) {
      await prisma.store.deleteMany({ where: { organizationId } });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("creates arbitrary work types and deduplicates business events", async () => {
    const input = {
      organizationId,
      storeId,
      userId,
      code: "CUSTOM_REPACK",
      name: "重新打包",
      quantity: "3",
      unit: "箱",
      sourceType: "MANUAL_TEST",
      sourceId: runId,
      dedupeKey: `CUSTOM_REPACK:${runId}`,
    };
    const first = await recordWork(prisma, input);
    const repeated = await recordWork(prisma, input);
    expect(repeated.id).toBe(first.id);
    await expect(
      prisma.workRecord.count({ where: { organizationId, dedupeKey: input.dedupeKey } })
    ).resolves.toBe(1);
    await expect(
      prisma.workType.findUniqueOrThrow({
        where: { organizationId_code: { organizationId, code: "CUSTOM_REPACK" } },
      })
    ).resolves.toMatchObject({ name: "重新打包", unit: "箱" });
  });

  it("aggregates new work types without adding report branches", () => {
    const result = aggregateWorkMetrics([
      {
        id: "a",
        userId,
        userName: "执行人",
        workTypeId: "receive",
        workCode: "RECEIVE",
        workName: "收货",
        quantity: "5",
        unit: "件",
        occurredAt: new Date("2026-08-16T01:00:00Z"),
      },
      {
        id: "b",
        userId,
        userName: "执行人",
        workTypeId: "custom",
        workCode: "CUSTOM_REPACK",
        workName: "重新打包",
        quantity: "2",
        unit: "箱",
        occurredAt: new Date("2026-08-16T02:00:00Z"),
      },
    ]);
    expect(result.types.map((type) => type.code).sort()).toEqual(["CUSTOM_REPACK", "RECEIVE"]);
    expect(result.rows[0].values.custom.quantity).toBe("2");
    expect(result.eventCount).toBe(2);
  });

  it("keeps relationship snapshots and calculates current settlement previews", () => {
    const result = aggregateWorkMetrics([
      {
        id: "priced",
        userId,
        userName: "外部协作者",
        workTypeId: "ship",
        workCode: "SHIP_ORDER",
        workName: "发货",
        quantity: "3",
        unit: "件",
        occurredAt: new Date("2026-08-16T03:00:00Z"),
        relationshipType: "WAREHOUSE_COLLABORATOR",
        locationName: "B 仓库",
        settlementRate: "2.5",
        settlementCurrency: "CNY",
      },
    ]);

    expect(result.rows[0].relationshipTypes).toEqual(["WAREHOUSE_COLLABORATOR"]);
    expect(result.records[0]).toMatchObject({
      relationshipType: "WAREHOUSE_COLLABORATOR",
      locationName: "B 仓库",
      settlementAmount: "7.5",
    });
    expect(result.settlement).toEqual([{ currency: "CNY", amount: "7.5", pricedRecords: 1 }]);
  });
});

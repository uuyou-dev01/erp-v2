import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { updateConsolidationStatusAction } from "@/app/actions/consolidations";

const runId = `consolidations_${Date.now()}`;
const organizationCode = `org_${runId}`;
const storeId = `store_${runId}`;

describe("consolidation batch actions", () => {
  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        code: organizationCode,
        name: "Consolidation Action Test Organization",
      },
    });

    await prisma.store.create({
      data: {
        id: storeId,
        organizationId: organization.id,
        code: `STORE_${runId}`,
        name: "Consolidation Action Test Store",
        currency: "CNY",
      },
    });
  });

  afterAll(async () => {
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { code: organizationCode } });
  });

  it("rejects out-of-sequence status changes without mutating the batch", async () => {
    const batch = await prisma.consolidationBatch.create({
      data: {
        storeId,
        status: "OPEN",
      },
    });

    const result = await updateConsolidationStatusAction(batch.id, "RECEIVED");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("当前状态不可确认到货");
    }

    const unchanged = await prisma.consolidationBatch.findUniqueOrThrow({
      where: { id: batch.id },
      select: { status: true, receivedAt: true },
    });
    expect(unchanged.status).toBe("OPEN");
    expect(unchanged.receivedAt).toBeNull();
  });
});

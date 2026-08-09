import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

import { assignWorkTaskAction } from "@/app/actions/tasks";
import {
  INCOMPLETE_TASK_STATUSES,
  TASK_STATUS,
  TASK_TYPE,
} from "@/lib/application/tasks";

const runId = `tasks_action_${Date.now()}`;
const email = `${runId}@example.com`;
let organizationId = "";
let storeId = "";

describe("task constants", () => {
  beforeAll(async () => {
    process.env.ERP_DEV_USER_EMAIL = email;
    const organization = await prisma.organization.create({ data: { code: runId, name: runId } });
    organizationId = organization.id;
    const store = await prisma.store.create({ data: { organizationId, code: runId, name: runId, currency: "CNY" } });
    storeId = store.id;
    const user = await prisma.user.create({ data: { email, password: "test", role: "OWNER", storeId } });
    await prisma.membership.create({ data: { organizationId, userId: user.id, role: "OWNER", status: "ACTIVE" } });
    await prisma.storeAccess.create({ data: { storeId, userId: user.id, role: "OWNER" } });
  });
  afterAll(async () => {
    delete process.env.ERP_DEV_USER_EMAIL;
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
  });
  it("uses ASSIGNED for delegated tasks", () => {
    expect(TASK_STATUS.ASSIGNED).toBe("ASSIGNED");
  });

  it("uses DONE for completed tasks", () => {
    expect(TASK_STATUS.DONE).toBe("DONE");
  });

  it("contains the shipment and listing task types needed by the workbench", () => {
    expect(TASK_TYPE.SHIP_ORDER).toBe("SHIP_ORDER");
    expect(TASK_TYPE.LISTING_CREATE).toBe("LISTING_CREATE");
    expect(TASK_TYPE.SETTLE_ORDER).toBe("SETTLE_ORDER");
  });

  it("treats open assigned in-progress and overdue tasks as incomplete", () => {
    expect(INCOMPLETE_TASK_STATUSES).toEqual([
      TASK_STATUS.OPEN,
      TASK_STATUS.ASSIGNED,
      TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.OVERDUE,
    ]);
  });

  it("returns a structured failure when assigning a missing task", async () => {
    const result = await assignWorkTaskAction("missing_task", "missing_user");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("任务不存在");
    }
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findNotification: vi.fn(),
  updateNotifications: vi.fn(),
  findMembership: vi.fn(),
  findStore: vi.fn(),
  user: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notification: { findFirst: mocks.findNotification, updateMany: mocks.updateNotifications },
    membership: { findUnique: mocks.findMembership },
    storeAccess: { findFirst: mocks.findStore },
  },
}));
vi.mock("@/lib/auth/user-context", () => ({
  ACTIVE_ORGANIZATION_COOKIE: "organization",
  ACTIVE_STORE_COOKIE: "store",
  requireAuthenticatedUser: mocks.user,
}));
vi.mock("@/lib/auth/cookie-security", () => ({ isSecureCookieEnabled: () => false }));
import { GET } from "@/app/notifications/open/[id]/route";

const open = () =>
  GET(new Request("http://localhost/notifications/open/n1"), {
    params: Promise.resolve({ id: "n1" }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "u1" });
  mocks.findNotification.mockResolvedValue({
    organizationId: "o1",
    actionUrl: "/sales/order1",
    refType: "CUSTOMER_ORDER",
    refId: "order1",
  });
  mocks.findMembership.mockResolvedValue({ status: "ACTIVE" });
  mocks.findStore.mockResolvedValue({ storeId: "s1" });
  mocks.updateNotifications.mockResolvedValue({ count: 1 });
});

describe("opening desktop notifications", () => {
  it("opens the destination, switches context and marks only the recipient's unread notification", async () => {
    const response = await open();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/sales/order1");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.cookies.get("organization")?.value).toBe("o1");
    expect(mocks.updateNotifications).toHaveBeenCalledWith({
      where: { id: "n1", recipientId: "u1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
  it("does not mark inaccessible historical notifications as read", async () => {
    mocks.findMembership.mockResolvedValue({ status: "INACTIVE" });
    const response = await open();
    expect(response.headers.get("location")).toBe("/notifications/missing");
    expect(mocks.updateNotifications).not.toHaveBeenCalled();
  });
  it("does not update missing notifications or follow external destinations", async () => {
    mocks.findNotification.mockResolvedValueOnce(null);
    expect((await open()).status).toBe(404);
    mocks.findNotification.mockResolvedValueOnce({
      organizationId: "o1",
      actionUrl: "//example.com",
      refType: null,
      refId: null,
    });
    expect((await open()).status).toBe(404);
    expect(mocks.updateNotifications).not.toHaveBeenCalled();
  });
});

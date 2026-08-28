import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_STORE_COOKIE,
  requireAuthenticatedUser,
} from "@/lib/auth/user-context";
import { isSecureCookieEnabled } from "@/lib/auth/cookie-security";

function fallbackDestination(notification: {
  actionUrl: string | null;
  refType: string | null;
  refId: string | null;
}) {
  if (notification.actionUrl) return notification.actionUrl;
  if (notification.refType === "CUSTOMER_ORDER" && notification.refId) {
    return `/sales/${encodeURIComponent(notification.refId)}`;
  }
  if (notification.refType === "LISTING" && notification.refId) {
    return `/listing/${encodeURIComponent(notification.refId)}`;
  }
  return "/workbench";
}

function safeInternalPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [user, { id }] = await Promise.all([requireAuthenticatedUser(), params]);
    const notification = await prisma.notification.findFirst({
      where: { id, recipientId: user.id },
      select: {
        organizationId: true,
        actionUrl: true,
        refType: true,
        refId: true,
      },
    });
    if (!notification) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const destination = fallbackDestination(notification);
    if (!safeInternalPath(destination)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const membership = await prisma.membership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: notification.organizationId,
          userId: user.id,
        },
      },
      select: { status: true },
    });
    // A former member must not be able to reuse historical business-object
    // notification URLs. The membership lifecycle notice itself remains usable
    // so the recipient can continue to onboarding and another active company.
    if (membership && membership.status !== "ACTIVE" && notification.refType !== "MEMBERSHIP") {
      return new NextResponse(null, {
        status: 307,
        headers: { location: "/notifications/missing" },
      });
    }
    // Keep the redirect same-origin. A relative Location also avoids trusting a
    // proxy-provided Host header and works when the standalone server sees an
    // internal hostname that differs from the browser-facing hostname.
    const response = new NextResponse(null, {
      status: 307,
      headers: { location: destination },
    });
    if (membership?.status === "ACTIVE") {
      const storeAccess = await prisma.storeAccess.findFirst({
        where: {
          userId: user.id,
          store: { organizationId: notification.organizationId },
        },
        orderBy: { createdAt: "asc" },
        select: { storeId: true },
      });
      const cookieOptions = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: isSecureCookieEnabled(),
        path: "/",
        priority: "high" as const,
      };
      response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, notification.organizationId, cookieOptions);
      if (storeAccess) {
        response.cookies.set(ACTIVE_STORE_COOKIE, storeAccess.storeId, cookieOptions);
      }
    }
    return response;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

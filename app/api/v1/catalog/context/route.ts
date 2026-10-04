import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { catalogErrorResponse } from "@/lib/catalog/http";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const memberships = await prisma.membership.findMany({
      where: { userId: user.id, status: "ACTIVE" },
      select: { organization: { select: { id: true, name: true } } },
    });
    const accesses = await prisma.storeAccess.findMany({
      where: {
        userId: user.id,
        store: { organizationId: { in: memberships.map((m) => m.organization.id) } },
      },
      select: { store: { select: { id: true, name: true, organizationId: true } } },
    });
    return NextResponse.json(
      {
        success: true,
        user,
        organizations: memberships.map((m) => m.organization),
        stores: accesses.map((a) => a.store),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

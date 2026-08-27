import { hashInvitationToken } from "@/lib/auth/invitation-token";
import { prisma } from "@/lib/prisma";

type InvitationKind = "TEAM" | "WAREHOUSE";

export type InvitedSignup = {
  kind: InvitationKind;
  email: string;
  nextPath: string;
};

function invitationTarget(nextPath: string) {
  const match = nextPath.match(/^\/invite\/(team|warehouse)\/([^/?#]+)$/);
  if (!match) return null;
  try {
    return {
      kind: match[1] === "team" ? ("TEAM" as const) : ("WAREHOUSE" as const),
      token: decodeURIComponent(match[2]),
    };
  } catch {
    return null;
  }
}

export async function getInvitedSignup(nextPath: string): Promise<InvitedSignup | null> {
  const target = invitationTarget(nextPath);
  if (!target?.token) return null;
  const tokenHash = hashInvitationToken(target.token);
  const now = new Date();

  if (target.kind === "TEAM") {
    const invitation = await prisma.organizationInvitation.findFirst({
      where: { tokenHash, status: "PENDING", expiresAt: { gt: now } },
      select: { email: true },
    });
    return invitation
      ? { kind: target.kind, email: invitation.email.toLowerCase(), nextPath }
      : null;
  }

  const invitation = await prisma.locationFulfiller.findFirst({
    where: { tokenHash, status: "INVITED", expiresAt: { gt: now } },
    select: { email: true },
  });
  return invitation ? { kind: target.kind, email: invitation.email.toLowerCase(), nextPath } : null;
}

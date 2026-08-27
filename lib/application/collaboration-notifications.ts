import { notifyUser } from "@/lib/application/notifications";
import { ROLES } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export async function notifyOrganizationAdministrators(input: {
  organizationId: string;
  actorId?: string | null;
  includeUserIds?: string[];
  roles?: string[];
  refType: string;
  refId: string;
  type: string;
  title: string;
  body?: string | null;
  actionUrl: string;
  dedupeKey: string;
  priority?: "LOW" | "NORMAL" | "HIGH";
}) {
  const memberships = await prisma.membership.findMany({
    where: {
      organizationId: input.organizationId,
      status: "ACTIVE",
      role: { in: input.roles ?? [ROLES.OWNER, ROLES.ADMIN] },
    },
    select: { userId: true },
  });
  const recipientIds = Array.from(
    new Set([...memberships.map(({ userId }) => userId), ...(input.includeUserIds ?? [])])
  );
  await Promise.all(
    recipientIds.map((recipientId) =>
      notifyUser({
        organizationId: input.organizationId,
        recipientId,
        actorId: input.actorId,
        refType: input.refType,
        refId: input.refId,
        type: input.type,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl,
        dedupeKey: `${input.dedupeKey}:${recipientId}`,
        priority: input.priority,
      })
    )
  );
  return recipientIds;
}

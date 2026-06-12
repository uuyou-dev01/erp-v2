import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logActivity(input: {
  organizationId: string;
  storeId?: string | null;
  actorId?: string | null;
  action: string;
  refType: string;
  refId: string;
  taskId?: string | null;
  before?: unknown;
  after?: unknown;
  message?: string | null;
}) {
  return prisma.activityLog.create({
    data: {
      organizationId: input.organizationId,
      storeId: input.storeId,
      actorId: input.actorId,
      action: input.action,
      refType: input.refType,
      refId: input.refId,
      taskId: input.taskId,
      before:
        input.before === undefined
          ? Prisma.JsonNull
          : (input.before as Prisma.InputJsonValue),
      after:
        input.after === undefined
          ? Prisma.JsonNull
          : (input.after as Prisma.InputJsonValue),
      message: input.message,
    },
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { assignTask } from "@/lib/application/tasks";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";

export async function assignWorkTask(taskId: string, assignedToId: string) {
  const context = await requireUserContext();
  const task = await prisma.task.findFirst({
    where: { id: taskId, organizationId: context.organizationId },
    select: { id: true, storeId: true },
  });
  if (!task) {
    throw new Error("任务不存在或无权操作");
  }

  const assignee = await prisma.user.findFirst({
    where: {
      id: assignedToId,
      memberships: {
        some: {
          organizationId: context.organizationId,
          status: "ACTIVE",
        },
      },
      storeAccesses: {
        some: {
          storeId: task.storeId,
        },
      },
    },
    select: { id: true },
  });
  if (!assignee) {
    throw new Error("被指派成员无权访问该店铺");
  }

  await assignTask({
    taskId,
    assignedToId,
    actorId: context.userId,
    organizationId: context.organizationId,
  });
  revalidatePath("/workbench");
}

export async function assignWorkTaskAction(taskId: string, assignedToId: string) {
  try {
    await assignWorkTask(taskId, assignedToId);
    return actionSuccess({ taskId });
  } catch (error) {
    return toActionFailure(error, "指派失败，请重试");
  }
}

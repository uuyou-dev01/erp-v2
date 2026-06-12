"use server";

import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/user-context";
import { assignTask } from "@/lib/application/tasks";

export async function assignWorkTask(taskId: string, assignedToId: string) {
  const context = await requireUserContext();
  await assignTask({
    taskId,
    assignedToId,
    actorId: context.userId,
    organizationId: context.organizationId,
  });
  revalidatePath("/workbench");
}

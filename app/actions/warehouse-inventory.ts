"use server";

import { requireAuthenticatedUser } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { actionSuccess, toActionFailure } from "@/lib/application/action-result";
import { notifyOrganizationAdministrators } from "@/lib/application/collaboration-notifications";

export async function requestWarehouseStocktake(input: { locationId: string; note: string }) {
  try {
    const user = await requireAuthenticatedUser();
    const note = input.note.trim();
    if (!note || note.length > 1000) throw new Error("请填写差异说明，最多 1000 字");
    const relationship = await prisma.locationFulfiller.findFirst({
      where: {
        userId: user.id,
        locationId: input.locationId,
        role: "MANAGER",
        status: "ACTIVE",
        organization: { memberships: { none: { userId: user.id, status: { not: "ACTIVE" } } } },
      },
      select: {
        organizationId: true,
        location: {
          select: { name: true, code: true, store: { select: { organizationId: true } } },
        },
      },
    });
    if (!relationship || relationship.location.store.organizationId !== relationship.organizationId)
      throw new Error("仅合作中的仓库负责人可以反馈本仓库存差异");
    const recipients = await notifyOrganizationAdministrators({
      organizationId: relationship.organizationId,
      actorId: user.id,
      refType: "LOCATION",
      refId: input.locationId,
      type: "WAREHOUSE_STOCKTAKE_REQUEST",
      title: `请核对 ${relationship.location.name} 的库存`,
      body: `${user.name || user.email}（${relationship.location.code}）反馈：${note}`,
      actionUrl: `/inventory/stocktake?locationId=${encodeURIComponent(input.locationId)}`,
      dedupeKey: `warehouse-stocktake:${user.id}:${input.locationId}:${new Date().toISOString().slice(0, 13)}:${note}`,
    });
    if (!recipients.length) throw new Error("货主尚未配置可接收通知的负责人，请直接联系货主");
    return actionSuccess({ locationId: input.locationId });
  } catch (error) {
    return toActionFailure(error, "提交盘点请求失败");
  }
}

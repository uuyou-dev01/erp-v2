import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";

export const MOBILE_DEVICE_COOKIE = "erp_mobile_device";

export async function requireActiveCompanionDevice() {
  const context = await requireUserContext();
  const deviceId = (await cookies()).get(MOBILE_DEVICE_COOKIE)?.value;
  if (!deviceId) throw new Error("当前手机尚未绑定，请刷新页面后重试");
  const device = await prisma.companionDevice.findFirst({
    where: { id: deviceId, organizationId: context.organizationId, userId: context.userId, revokedAt: null },
  });
  if (!device) throw new Error("当前设备已撤销或无权访问，请重新绑定");
  await prisma.companionDevice.update({ where: { id: device.id }, data: { lastUsedAt: new Date() } });
  return { context, device };
}

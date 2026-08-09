import webpush from "web-push";
import { prisma } from "@/lib/prisma";

function configured() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(process.env.WEB_PUSH_SUBJECT || "mailto:admin@example.com", publicKey, privateKey);
  return { publicKey };
}

export function getWebPushPublicKey() {
  return configured()?.publicKey ?? null;
}

export async function sendPushToUser(input: {
  organizationId: string;
  userId: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
}) {
  if (!configured()) return { sent: 0, disabled: true };
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { organizationId: input.organizationId, userId: input.userId, revokedAt: null },
  });
  let sent = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify({ title: input.title, body: input.body, actionUrl: input.actionUrl })
      );
      await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastSuccessAt: new Date() } });
      sent += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      await prisma.pushSubscription.update({
        where: { id: subscription.id },
        data: { lastFailureAt: new Date(), revokedAt: statusCode === 404 || statusCode === 410 ? new Date() : undefined },
      });
    }
  }
  return { sent, disabled: false };
}

export type NotificationView = "all" | "unread" | "pending" | "read";

export function matchesNotificationView(
  notification: { readAt: string | null; resolvedAt: string | null },
  view: NotificationView
) {
  if (view === "unread") return !notification.readAt;
  if (view === "read") return Boolean(notification.readAt);
  if (view === "pending") return !notification.resolvedAt;
  return true;
}

/** Remove only a known order reference repeated in the dedicated order metadata. */
export function notificationBody(input: {
  body: string | null;
  orderNumber: string | null;
  externalOrderNo: string | null;
}) {
  const body = input.body?.trim() ?? "";
  const displayedOrder = input.externalOrderNo || input.orderNumber;
  if (!displayedOrder) return body;
  // Preserve an internal order number when the metadata displays a different external one.
  if (body === `发货订单 ${displayedOrder}` || body === `订单 ${displayedOrder}`) return "";
  for (const prefix of [`${displayedOrder}：`, `${displayedOrder}:`]) {
    if (body.startsWith(prefix)) return body.slice(prefix.length).trim();
  }
  return body;
}

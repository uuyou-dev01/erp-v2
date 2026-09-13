import { NotificationRefresh } from "@/components/notifications/notification-refresh";
import { getMyNotifications } from "@/app/actions/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const notifications = await getMyNotifications();
  const rows = notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    type: notification.type,
    readAt: notification.readAt?.toISOString() ?? null,
    resolvedAt: notification.resolvedAt?.toISOString() ?? null,
    resolutionCode: notification.resolutionCode,
    createdAt: notification.createdAt.toISOString(),
    refType: notification.refType,
    refId: notification.refId,
    actionUrl: notification.actionUrl,
    organizationName: notification.organizationName,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="通知"
        description="查看当前账号在各企业中的任务指派、外部任务协作和异常提醒。"
      />
      <NotificationRefresh />
      <NotificationList notifications={rows} />
    </div>
  );
}

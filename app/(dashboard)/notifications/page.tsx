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
    createdAt: notification.createdAt.toISOString(),
    refType: notification.refType,
    refId: notification.refId,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        title="通知"
        description="查看任务指派、转派、完成和异常提醒。"
      />
      <NotificationList notifications={rows} />
    </div>
  );
}

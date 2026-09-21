"use client";

import { showActionSuccess } from "@/components/feedback/action-feedback";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check, CheckCircle2, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  matchesNotificationView,
  notificationBody,
  type NotificationView,
} from "@/lib/notification-presentation";
import { Badge } from "@/components/ui/badge";
import { markMyNotificationReadAction } from "@/app/actions/notifications";

interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  type: string;
  readAt: string | null;
  resolvedAt: string | null;
  resolutionCode: string | null;
  createdAt: string;
  refType: string | null;
  refId: string | null;
  actionUrl: string | null;
  organizationName: string;
  customerName: string | null;
  orderNumber: string | null;
  externalOrderNo: string | null;
  platformName: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  ORDER_SHIPPED: "订单发货",
  SHIPPING_PROGRESS_UPDATED: "发货进度",
  SHIPPING_PREPARATION_UPDATED: "发货前资料",
  WAREHOUSE_TASK_ASSIGNED: "发货指派",
  TASK_HANDOFF_REQUESTED: "任务转交",
  WAREHOUSE_STOCKTAKE_REQUEST: "库存核对",
  TASK_ASSIGNED: "任务指派",
  TASK_DONE: "任务完成",
  WAREHOUSE_TASK_AVAILABLE: "仓库任务",
  LOCATION_ACCESS_ADDED: "仓库授权",
  ORGANIZATION_CONNECTION_REQUEST: "企业连接",
  ORGANIZATION_CONNECTION_ACCEPTED: "企业连接",
  ORGANIZATION_CONNECTION_ENDED: "企业连接",
  SERVICE_AGREEMENT_PROPOSED: "服务协议",
  SERVICE_AGREEMENT_REVISION_PROPOSED: "服务协议修订",
  SERVICE_AGREEMENT_ACCEPTED: "服务协议",
  SERVICE_AGREEMENT_PAUSED: "服务协议",
  SERVICE_AGREEMENT_RESUMED: "服务协议",
  SERVICE_AGREEMENT_ENDED: "服务协议",
  SUPPLY_OFFER_STATUS_CHANGED: "货盘状态",
  FULFILLMENT_REQUESTED: "履约请求",
  FULFILLMENT_STATUS_CHANGED: "履约状态",
  SETTLEMENT_STATUS_CHANGED: "结算状态",
  MEMBERSHIP_ACCESS_CHANGED: "成员权限",
  MEMBERSHIP_DEACTIVATED: "成员停用",
  MEMBERSHIP_INVITATION_ACCEPTED: "成员邀请",
  PRODUCT_RECORD_READY: "商品资料",
};

const RESOLUTION_LABELS: Record<string, string> = {
  INFORMATIONAL: "结果通知",
  TASK_STARTED: "已领取并开始处理",
  TASK_COMPLETED: "已完成",
  TASK_CANCELLED: "已取消",
  TASK_REASSIGNED: "已改派",
  CONNECTION_ACCEPTED: "已接受",
  CONNECTION_REJECTED: "已拒绝",
  CONNECTION_ENDED: "连接已结束",
  AGREEMENT_ACCEPTED: "协议已接受",
  AGREEMENT_ENDED: "协议已结束",
};

function notificationHref(notification: NotificationRow) {
  return `/notifications/open/${encodeURIComponent(notification.id)}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notificationError, setNotificationError] = useState<string | null>(null);

  const [view, setView] = useState<NotificationView>("all");
  const [query, setQuery] = useState("");
  const tabs: { value: NotificationView; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "unread", label: "未读" },
    { value: "pending", label: "待处理" },
    { value: "read", label: "已读" },
  ];
  const search = query.trim().toLocaleLowerCase();
  const searched = notifications.filter((notification) =>
    [
      notification.title,
      notification.body,
      notification.customerName,
      notification.orderNumber,
      notification.externalOrderNo,
      notification.organizationName,
      notification.platformName,
      TYPE_LABELS[notification.type],
    ].some((value) => value?.toLocaleLowerCase().includes(search))
  );
  const visible = searched.filter((notification) => matchesNotificationView(notification, view));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="通知状态"
          className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1"
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.value}
              id={`notification-tab-${tab.value}`}
              type="button"
              role="tab"
              aria-selected={view === tab.value}
              aria-controls="notification-panel"
              tabIndex={view === tab.value ? 0 : -1}
              onClick={() => setView(tab.value)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % tabs.length
                    : event.key === "ArrowLeft"
                      ? (index + tabs.length - 1) % tabs.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? tabs.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                setView(tabs[next].value);
                document.getElementById(`notification-tab-${tabs[next].value}`)?.focus();
              }}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                view === tab.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background hover:text-foreground"
              }`}
            >
              {tab.label}
              <span className="rounded px-1 text-xs tabular-nums">
                {
                  searched.filter((notification) =>
                    matchesNotificationView(notification, tab.value)
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="搜索通知"
            placeholder="搜索客户、订单号、企业或内容"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        最近 {notifications.length} 条通知（最多 80 条） ·
        未读表示尚未查看，待处理表示业务仍需跟进。
      </p>
      <div
        id="notification-panel"
        role="tabpanel"
        aria-labelledby={`notification-tab-${view}`}
        tabIndex={0}
        className="overflow-hidden rounded-lg border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {notificationError ? (
          <div
            role="alert"
            className="flex gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{notificationError}</p>
          </div>
        ) : null}
        {visible.length === 0 ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center px-4 text-center">
            <Bell aria-hidden="true" className="h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">
              {query
                ? "没有匹配的通知"
                : view === "unread"
                  ? "未读通知已清空"
                  : view === "pending"
                    ? "暂无待处理通知"
                    : view === "read"
                      ? "暂无已读通知"
                      : "暂无通知"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {query
                ? "试试其他关键词，或清除搜索查看通知。"
                : "任务指派、订单进度和协作提醒会显示在这里。"}
            </p>
            {query ? (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setQuery("")}>
                清除搜索
              </Button>
            ) : null}
          </div>
        ) : (
          visible.map((notification) => {
            const unread = !notification.readAt;
            const body = notificationBody(notification);
            return (
              <div
                key={notification.id}
                className={`group relative flex items-start gap-3 border-b border-l-[3px] px-4 py-4 last:border-b-0 transition-colors ${unread ? "border-l-blue-600 bg-blue-50/80 hover:bg-blue-100/70 dark:bg-blue-950/40 dark:hover:bg-blue-950/60" : "border-l-transparent bg-card hover:bg-muted/50"}`}
              >
                <div
                  aria-hidden="true"
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${unread ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground"}`}
                >
                  {notification.resolvedAt ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Bell className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <a
                      href={notificationHref(notification)}
                      className={`break-words text-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring ${unread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}
                    >
                      {notification.customerName
                        ? `${notification.customerName} · ${notification.title}`
                        : notification.title}
                    </a>
                    <span
                      className={`text-xs ${unread ? "font-semibold text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}
                    >
                      {unread ? "未读" : "已读"}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        notification.resolvedAt
                          ? "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                          : "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                      }
                    >
                      {notification.resolvedAt
                        ? (RESOLUTION_LABELS[notification.resolutionCode ?? ""] ?? "已处理")
                        : "待处理"}
                    </Badge>
                  </div>
                  {body ? (
                    <p
                      className={`mt-2 break-words text-sm ${unread ? "text-foreground/80" : "text-muted-foreground"}`}
                    >
                      {body}
                    </p>
                  ) : null}
                  {notification.externalOrderNo || notification.orderNumber ? (
                    <p className="mt-2 break-all text-xs text-foreground/80">
                      {notification.platformName ?? "销售订单"} ·{" "}
                      {notification.externalOrderNo || notification.orderNumber}
                    </p>
                  ) : null}
                  <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {notification.organizationName} ·{" "}
                      {TYPE_LABELS[notification.type] ?? "其他通知"}
                    </span>
                    <time
                      dateTime={notification.createdAt}
                      title={new Date(notification.createdAt).toLocaleString("zh-CN")}
                    >
                      {dateLabel(notification.createdAt)}
                    </time>
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {unread ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="relative z-10 h-8 px-2 text-xs text-blue-700 hover:bg-blue-200/60 dark:text-blue-300"
                      disabled={pending}
                      aria-label={`将“${notification.title}”标记为已读`}
                      onClick={() => {
                        setNotificationError(null);
                        startTransition(async () => {
                          try {
                            const result = await markMyNotificationReadAction(notification.id);
                            if (!result.success) {
                              setNotificationError(result.error);
                              return;
                            }
                            showActionSuccess("已标记为已读");
                            router.refresh();
                          } catch (error) {
                            setNotificationError(
                              error instanceof Error ? error.message : "标记通知已读失败，请重试"
                            );
                          }
                        });
                      }}
                    >
                      <Check aria-hidden="true" className="h-4 w-4 sm:mr-1" />
                      <span className="hidden sm:inline">标为已读</span>
                    </Button>
                  ) : null}
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground group-hover:text-primary"
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

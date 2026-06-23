import {
  Bell,
  Box,
  ClipboardList,
  FileText,
  Globe,
  LogIn,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  Settings,
  ShoppingCart,
  Store,
  TriangleAlert,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { QueueCounts, WorkQueue } from "@/lib/application/next-actions";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  queue?: WorkQueue;
  badgeKey?: keyof QueueCounts;
  submenu?: NavItem[];
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const operationsNavigation: NavGroup[] = [
  {
    title: "工作台",
    items: [
      { name: "工作台", href: "/workbench", icon: ClipboardList, badgeKey: "total" },
      { name: "通知", href: "/notifications", icon: Bell },
      {
        name: "异常中心",
        href: "/workbench?queue=exception",
        icon: TriangleAlert,
        queue: "exception",
        badgeKey: "exception",
      },
    ],
  },
  {
    title: "采购与补货",
    items: [
      { name: "采购单据", href: "/procurement", icon: ShoppingCart },
    ],
  },
  {
    title: "集运与仓配",
    items: [
      { name: "集运物流", href: "/logistics/consolidations", icon: Truck },
    ],
  },
  {
    title: "库存与商品",
    items: [
      { name: "库存看板", href: "/inventory/sellable", icon: PackageCheck },
      { name: "商品主档", href: "/inventory/skus", icon: Store },
      { name: "单件库存", href: "/inventory/items", icon: PackageOpen },
      { name: "库存批次", href: "/inventory/lots", icon: Package },
      { name: "库存盘点", href: "/inventory/stocktake", icon: Box },
    ],
  },
  {
    title: "上架与订单",
    items: [
      { name: "上架运营", href: "/listing", icon: Globe },
      { name: "销售订单", href: "/sales", icon: Package },
    ],
  },
  {
    title: "经营分析",
    items: [
      { name: "经营报表", href: "/reports", icon: FileText },
      { name: "团队工作量", href: "/reports/team", icon: Users },
    ],
  },
];

export const settingsNavigation: NavItem[] = [
  { name: "销售平台", href: "/listing/platforms", icon: Store },
  { name: "仓库位置", href: "/inventory/locations", icon: MapPin },
  { name: "团队成员", href: "/settings/team", icon: Users },
  { name: "店铺管理", href: "/settings/stores", icon: Settings },
  { name: "切换操作人", href: "/login", icon: LogIn },
];

export const commandQuickActions = [
  { id: "qa-workbench", title: "打开工作台", subtitle: "今日待办", href: "/workbench" },
  { id: "qa-quick-entry", title: "快速录入", subtitle: "采购 / 物流 / 上架 / 售出", href: "/workbench?action=quickEntry" },
  { id: "qa-notifications", title: "通知中心", subtitle: "任务委托与处理提醒", href: "/notifications" },
  { id: "qa-exception", title: "异常队列", subtitle: "优先处理风险商品", href: "/workbench?queue=exception" },
  { id: "qa-ship", title: "待发货", subtitle: "销售履约", href: "/workbench?queue=pendingShipment" },
  { id: "qa-team-report", title: "团队工作量", subtitle: "人员上架、发货、结算统计", href: "/reports/team" },
  { id: "qa-team-settings", title: "团队成员", subtitle: "账号角色与店铺权限", href: "/settings/team" },
  { id: "qa-store-settings", title: "店铺管理", subtitle: "经营主体店铺配置", href: "/settings/stores" },
];

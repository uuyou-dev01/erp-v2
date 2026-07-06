import {
  Bell,
  Box,
  ClipboardList,
  FileText,
  Globe,
  Handshake,
  LogIn,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  PackageSearch,
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
    title: "采购与仓配",
    items: [
      { name: "采购单据", href: "/procurement", icon: ShoppingCart },
      { name: "集运物流", href: "/logistics/consolidations", icon: Truck },
      { name: "代发履约", href: "/fulfillment/requests", icon: Truck },
    ],
  },
  {
    title: "商品与库存",
    items: [
      {
        name: "商品档案",
        href: "/inventory/skus",
        icon: Store,
        submenu: [
          { name: "商品主档", href: "/inventory/skus", icon: Store },
          { name: "商品情报", href: "/product-intelligence", icon: PackageSearch },
        ],
      },
      {
        name: "库存管理",
        href: "/inventory/sellable",
        icon: PackageCheck,
        submenu: [
          { name: "库存看板", href: "/inventory/sellable", icon: PackageCheck },
          { name: "单件库存", href: "/inventory/items", icon: PackageOpen },
          { name: "库存批次", href: "/inventory/lots", icon: Package },
          { name: "库存盘点", href: "/inventory/stocktake", icon: Box },
        ],
      },
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
    title: "货盘与代卖",
    items: [
      { name: "货盘市场", href: "/marketplace", icon: PackageSearch },
      { name: "我的供给", href: "/marketplace/my-offers", icon: PackageCheck },
      { name: "代卖上架", href: "/resale", icon: Store },
    ],
  },
  {
    title: "财务与报表",
    items: [
      { name: "结算单", href: "/finance/settlements", icon: FileText },
      { name: "经营报表", href: "/reports", icon: FileText },
      { name: "团队工作量", href: "/reports/team", icon: Users },
    ],
  },
];

export const settingsNavigation: NavItem[] = [
  { name: "销售平台", href: "/listing/platforms", icon: Store },
  { name: "合作方", href: "/settings/partners", icon: Handshake },
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
  { id: "qa-fulfillment", title: "代发履约", subtitle: "供给方代发请求", href: "/fulfillment/requests" },
  { id: "qa-marketplace", title: "货盘市场", subtitle: "查看公开与授权货盘", href: "/marketplace" },
  { id: "qa-product-intelligence", title: "商品情报", subtitle: "会员分享行情与商品经验", href: "/product-intelligence" },
  { id: "qa-my-offers", title: "我的供给", subtitle: "发布和维护供给货盘", href: "/marketplace/my-offers" },
  { id: "qa-resale", title: "代卖上架", subtitle: "维护从货盘创建的销售记录", href: "/resale" },
  { id: "qa-partners", title: "合作方", subtitle: "供货、代卖、代发关系", href: "/settings/partners" },
  { id: "qa-settlements", title: "结算单", subtitle: "代卖应收应付", href: "/finance/settlements" },
  { id: "qa-team-report", title: "团队工作量", subtitle: "人员上架、发货、结算统计", href: "/reports/team" },
  { id: "qa-team-settings", title: "团队成员", subtitle: "账号角色与店铺权限", href: "/settings/team" },
  { id: "qa-store-settings", title: "店铺管理", subtitle: "经营主体店铺配置", href: "/settings/stores" },
];

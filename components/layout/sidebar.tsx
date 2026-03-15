"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Warehouse,
  ListChecks,
  FileText,
  Users,
  MapPin,
  Box,
  PackageOpen,
  Globe,
} from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "仪表盘", href: "/dashboard", icon: LayoutDashboard },
  {
    name: "库存管理",
    href: "/inventory",
    icon: Warehouse,
    submenu: [
      { name: "仓库位置", href: "/inventory/locations", icon: MapPin },
      { name: "商品SKU", href: "/inventory/skus", icon: Box },
      { name: "库存批次", href: "/inventory/lots", icon: Package },
      { name: "单件商品", href: "/inventory/items", icon: PackageOpen },
    ],
  },
  { name: "采购管理", href: "/procurement", icon: ShoppingCart },
  { name: "销售管理", href: "/sales", icon: Package },
  {
    name: "商品上架",
    href: "/listing",
    icon: Globe,
    submenu: [
      { name: "上架列表", href: "/listing", icon: ListChecks },
      { name: "销售平台", href: "/listing/platforms", icon: Globe },
    ],
  },
  { name: "报表分析", href: "/reports", icon: FileText },
  { name: "团队管理", href: "/team", icon: Users },
];

export function Sidebar() {
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<string[]>(["Inventory"]);

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <h1 className="text-xl font-bold">跨境贸易ERP系统</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const isExpanded = expandedItems.includes(item.name);
          const hasSubmenu = "submenu" in item && item.submenu;

          return (
            <div key={item.name}>
              {hasSubmenu ? (
                <>
                  <button
                    onClick={() => toggleExpand(item.name)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.submenu.map((subitem) => {
                        const isSubActive = pathname === subitem.href;
                        return (
                          <Link
                            key={subitem.name}
                            href={subitem.href}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              isSubActive
                                ? "bg-accent text-accent-foreground font-medium"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            <subitem.icon className="h-4 w-4" />
                            {subitem.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

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
  MapPin,
  Box,
  PackageOpen,
  Globe,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";

const navigation = [
  { name: "仪表盘", href: "/dashboard", icon: LayoutDashboard },
  {
    name: "库存管理",
    href: "/inventory",
    icon: Warehouse,
    submenu: [
      { name: "仓库位置", href: "/inventory/locations", icon: MapPin },
      { name: "商品SKU", href: "/inventory/skus", icon: Box },
      { name: "入库库存", href: "/inventory/lots", icon: Package },
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
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(["库存管理"]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]);

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose();
  };

  const sidebarContent = (
    <>
      <div className={cn(
        "flex h-14 items-center border-b border-white/20 px-4",
        collapsed ? "justify-center" : "justify-between"
      )}>
        {!collapsed && <h1 className="text-lg font-bold text-white truncate">跨境贸易ERP</h1>}
        {collapsed && <Box className="h-6 w-6 text-white" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex items-center justify-center h-7 w-7 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="md:hidden flex items-center justify-center h-7 w-7 rounded-md hover:bg-white/20 text-white/80 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          const isExpanded = expandedItems.includes(item.name);
          const hasSubmenu = "submenu" in item && item.submenu;

          return (
            <div key={item.name}>
              {hasSubmenu ? (
                <>
                  <button
                    onClick={() => toggleExpand(item.name)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      collapsed ? "justify-center" : "",
                      isActive
                        ? "bg-white/30 text-white shadow-md"
                        : "text-white/80 hover:bg-white/20 hover:text-white"
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 text-left">{item.name}</span>
                        <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                      </>
                    )}
                  </button>
                  {isExpanded && !collapsed && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.submenu.map((subitem) => {
                        const isSubActive = pathname === subitem.href;
                        return (
                          <Link
                            key={subitem.name}
                            href={subitem.href}
                            onClick={handleNavClick}
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all",
                              isSubActive
                                ? "bg-white/25 text-white font-medium shadow-sm"
                                : "text-white/70 hover:bg-white/15 hover:text-white"
                            )}
                          >
                            <subitem.icon className="h-4 w-4 shrink-0" />
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
                  onClick={handleNavClick}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    collapsed ? "justify-center" : "",
                    isActive
                      ? "bg-white/30 text-white shadow-md"
                      : "text-white/80 hover:bg-white/20 hover:text-white"
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && item.name}
                </Link>
              )}
            </div>
          );
        })}
      </nav>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className={cn(
        "hidden md:flex h-full flex-col glass-sidebar transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64"
      )}>
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <div className="relative h-full w-64 flex flex-col glass-sidebar">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}

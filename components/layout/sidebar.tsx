"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getWorkbenchQueueCounts } from "@/app/actions/workbench";
import {
  getSellablePalletNavItems,
  type SellablePalletNavItem,
} from "@/app/actions/sellable-pallets";
import type { QueueCounts } from "@/lib/application/next-actions";
import {
  operationsNavigation,
  settingsNavigation,
  type NavItem,
} from "@/config/navigation";

const STORE_ID = "store_1";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function CountBadge({ count, critical }: { count: number; critical?: boolean }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums",
        critical ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function flattenNavItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.submenu ? flattenNavItems(item.submenu) : [])]);
}

const allNavItems = [
  ...operationsNavigation.flatMap((group) => flattenNavItems(group.items)),
  ...flattenNavItems(settingsNavigation),
];

function NavLink({
  item,
  active,
  collapsed,
  badgeCount,
  critical,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  badgeCount: number;
  critical?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={collapsed ? item.name : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        collapsed && "justify-center px-2",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0 opacity-70" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.name}</span>
          <CountBadge count={badgeCount} critical={critical} />
        </>
      )}
    </Link>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(["库存看板", "设置"]);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [sellablePallets, setSellablePallets] = useState<SellablePalletNavItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWorkbenchQueueCounts(STORE_ID),
      getSellablePalletNavItems(STORE_ID),
    ]).then(([queueCounts, palletItems]) => {
      if (cancelled) return;
      setCounts(queueCounts);
      setSellablePallets(palletItems);
    });
    return () => { cancelled = true; };
  }, [pathname]);

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

  const handleNavClick = () => onMobileClose?.();

  const isHrefActive = (href: string) => {
    if (href.includes("?")) {
      const [targetPath, targetSearch = ""] = href.split("?");
      if (pathname !== targetPath) return false;
      const targetParams = new URLSearchParams(targetSearch);
      for (const [key, value] of targetParams.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
      return true;
    }
    return pathname === href;
  };

  const isWorkflowActive = (item: NavItem) => {
    if (!item.queue && item.href !== "/workbench") {
      const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (!matches) return false;
      return !allNavItems.some(
        (other) =>
          other.href !== item.href &&
          other.href.startsWith(`${item.href}/`) &&
          (pathname === other.href || pathname.startsWith(`${other.href}/`))
      );
    }
    if (item.href === "/workbench" && pathname === "/workbench" && !item.queue) {
      return !searchParams.get("queue");
    }
    if (pathname !== "/workbench") return false;
    const currentQueue = searchParams.get("queue");
    if (!item.queue) return !currentQueue;
    return currentQueue === item.queue;
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 items-center border-b border-sidebar-border px-3", collapsed ? "justify-center" : "justify-between")}>
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
            跨境贸易 ERP
          </span>
        )}
        {collapsed && <Box className="h-4 w-4 text-sidebar-foreground" />}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent md:inline-flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
        {onMobileClose && (
          <button type="button" onClick={onMobileClose} className="inline-flex h-7 w-7 items-center justify-center rounded-md md:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="border-b border-sidebar-border p-3">
          <Link
            href="/workbench?action=quickEntry"
            className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            快速录入
          </Link>
        </div>
      )}

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {operationsNavigation.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const dynamicSubmenu =
                  item.href === "/inventory/sellable" ? sellablePallets : null;
                if (dynamicSubmenu && !collapsed) {
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <div key={item.href}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="flex-1 text-left">{item.name}</span>
                        <ChevronDown
                          className={cn(
                            "h-3 w-3 opacity-50",
                            expandedItems.includes(item.name) && "rotate-180"
                          )}
                        />
                      </button>
                      {expandedItems.includes(item.name) && dynamicSubmenu.length > 0 && (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                          {dynamicSubmenu.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href)
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="flex-1 truncate">{sub.name}</span>
                              <CountBadge count={sub.count} />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                if (item.submenu && !collapsed) {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <div key={item.href}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="flex-1 text-left">{item.name}</span>
                        <ChevronDown className={cn("h-3 w-3 opacity-50", expandedItems.includes(item.name) && "rotate-180")} />
                      </button>
                      {expandedItems.includes(item.name) && (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                          {item.submenu.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href)
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="flex-1 truncate">{sub.name}</span>
                              <CountBadge
                                count={sub.badgeKey && counts ? counts[sub.badgeKey] : 0}
                                critical={sub.badgeKey === "exception" || sub.badgeKey === "inspectionException"}
                              />
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isWorkflowActive(item)}
                    collapsed={collapsed}
                    badgeCount={item.badgeKey && counts ? counts[item.badgeKey] : 0}
                    critical={item.badgeKey === "exception" || item.badgeKey === "inspectionException"}
                    onClick={handleNavClick}
                  />
                );
              })}
            </div>
          </div>
        ))}

        <div>
          {!collapsed && (
            <button
              type="button"
              onClick={() => toggleExpand("设置")}
              className="mb-1 flex w-full items-center justify-between px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              设置
              <ChevronDown className={cn("h-3 w-3 transition", expandedItems.includes("设置") && "rotate-180")} />
            </button>
          )}
          {(collapsed || expandedItems.includes("设置")) && (
            <div className="space-y-0.5">
              {settingsNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const hasSubmenu = "submenu" in item && item.submenu;
                if (hasSubmenu && !collapsed) {
                  return (
                    <div key={item.name}>
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.name)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                        <span className="flex-1 text-left">{item.name}</span>
                        <ChevronDown className={cn("h-3 w-3 opacity-50", expandedItems.includes(item.name) && "rotate-180")} />
                      </button>
                      {expandedItems.includes(item.name) && (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                          {item.submenu!.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href)
                                  ? "font-medium text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {sub.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={handleNavClick}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                      collapsed && "justify-center",
                      isActive
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                    )}
                    title={collapsed ? item.name : undefined}
                  >
                    <item.icon className="h-4 w-4 shrink-0 opacity-70" />
                    {!collapsed && item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>
    </div>
  );

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        {sidebarContent}
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onMobileClose} />
          <aside className="relative flex h-full w-56 flex-col border-r bg-sidebar shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

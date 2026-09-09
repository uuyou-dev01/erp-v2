"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ListChecks,
  PackageCheck,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { getWorkbenchQueueCounts } from "@/app/actions/workbench";
import {
  getSellablePalletNavItems,
  type SellablePalletNavItem,
} from "@/app/actions/sellable-pallets";
import type { QueueCounts } from "@/lib/application/next-actions";
import { operationsNavigation, settingsAreaRoutes, type NavItem } from "@/config/navigation";
import { canUseQuickEntry, isNavigationHrefAllowed } from "@/lib/auth/permissions";

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  storeId: string;
  role: string;
  collaboration: {
    hasWarehouseCollaboration: boolean;
    pendingTaskCount: number;
  };
  setupStatus: {
    completedCoreCount: number;
    coreStepCount: number;
    isCoreComplete: boolean;
  } | null;
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

const allNavHrefs = [
  ...operationsNavigation.flatMap((group) =>
    flattenNavItems(group.items).flatMap((item) => [item.href, ...(item.matches ?? [])])
  ),
  ...Object.values(settingsAreaRoutes).flat(),
];

function navIconClass(active: boolean) {
  return cn(
    "h-4 w-4 shrink-0 transition-colors",
    active ? "text-primary opacity-100" : "opacity-60"
  );
}

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
      <item.icon className={navIconClass(active)} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.name}</span>
          <CountBadge count={badgeCount} critical={critical} />
        </>
      )}
    </Link>
  );
}

export function Sidebar({
  mobileOpen,
  onMobileClose,
  storeId,
  role,
  collaboration,
  setupStatus,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(["库存看板"]);
  const [counts, setCounts] = useState<QueueCounts | null>(null);
  const [sellablePallets, setSellablePallets] = useState<SellablePalletNavItem[]>([]);
  const mobileDialogRef = useRef<HTMLElement>(null);
  const mobileWasOpenRef = useRef(false);
  const visibleOperationsNavigation = useMemo(
    () =>
      operationsNavigation
        .map((group) => ({
          ...group,
          items: group.items.flatMap((item) => {
            const submenu = item.submenu?.filter((sub) => isNavigationHrefAllowed(role, sub.href));
            const allowedItemHref = [item.href, ...(item.matches ?? [])].find((href) =>
              isNavigationHrefAllowed(role, href)
            );
            if (!allowedItemHref && !submenu?.length) return [];
            return [
              {
                ...item,
                href: allowedItemHref ?? submenu?.[0]?.href ?? item.href,
                submenu,
              },
            ];
          }),
        }))
        .filter((group) => group.items.length > 0),
    [role]
  );
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWorkbenchQueueCounts(storeId),
      isNavigationHrefAllowed(role, "/inventory/sellable")
        ? getSellablePalletNavItems(storeId)
        : Promise.resolve([]),
    ]).then(([queueCounts, palletItems]) => {
      if (cancelled) return;
      setCounts(queueCounts);
      setSellablePallets(palletItems);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, role, storeId]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      if (mobileWasOpenRef.current) {
        mobileWasOpenRef.current = false;
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>('[aria-label="打开主导航"]')?.focus();
        });
      }
      return;
    }
    mobileWasOpenRef.current = true;
    window.requestAnimationFrame(() => {
      mobileDialogRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="关闭侧边栏"]')
        ?.focus();
    });
    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onMobileClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        mobileDialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeyboard);
    return () => window.removeEventListener("keydown", handleDialogKeyboard);
  }, [mobileOpen, onMobileClose]);

  useEffect(() => {
    const activeParents = visibleOperationsNavigation
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          item.submenu?.some(
            (sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)
          ) ?? false
      )
      .map((item) => item.name);

    if (activeParents.length > 0) {
      setExpandedItems((current) => Array.from(new Set([...current, ...activeParents])));
    }
  }, [pathname, visibleOperationsNavigation]);

  const toggleExpand = (name: string) => {
    setExpandedItems((prev) =>
      prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
    );
  };

  const handleNavClick = () => onMobileClose?.();

  const settingsHref =
    settingsAreaRoutes["/settings/system"].find((href) => isNavigationHrefAllowed(role, href)) ??
    settingsAreaRoutes["/settings/company"].find((href) => isNavigationHrefAllowed(role, href)) ??
    "/settings/personal";
  const operationActive = visibleOperationsNavigation
    .flatMap((group) => flattenNavItems(group.items))
    .some((item) =>
      [item.href, ...(item.matches ?? [])].some(
        (href) => pathname === href || pathname.startsWith(`${href}/`)
      )
    );
  const settingsActive =
    !operationActive &&
    Object.values(settingsAreaRoutes)
      .flat()
      .some((href) => pathname === href || pathname.startsWith(`${href}/`));

  const isHrefActive = (href: string, includeDescendants = false) => {
    if (href.includes("?")) {
      const [targetPath, targetSearch = ""] = href.split("?");
      if (pathname !== targetPath) return false;
      const targetParams = new URLSearchParams(targetSearch);
      for (const [key, value] of targetParams.entries()) {
        if (searchParams.get(key) !== value) return false;
      }
      return true;
    }
    return pathname === href || (includeDescendants && pathname.startsWith(`${href}/`));
  };

  const isBranchActive = (item: NavItem) => {
    const itemHrefs = [item.href, ...(item.matches ?? [])];
    return (
      itemHrefs.some((href) => pathname === href || pathname.startsWith(`${href}/`)) ||
      (item.submenu?.some((sub) => pathname === sub.href || pathname.startsWith(`${sub.href}/`)) ??
        false)
    );
  };

  const isWorkflowActive = (item: NavItem) => {
    if (!item.queue && item.href !== "/workbench") {
      const itemHrefs = [item.href, ...(item.matches ?? [])];
      const matches = itemHrefs.some(
        (href) => pathname === href || pathname.startsWith(`${href}/`)
      );
      if (!matches) return false;
      return !allNavHrefs.some(
        (otherHref) =>
          !itemHrefs.includes(otherHref) &&
          itemHrefs.some((itemHref) => otherHref.startsWith(`${itemHref}/`)) &&
          (pathname === otherHref || pathname.startsWith(`${otherHref}/`))
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
      <div
        className={cn(
          "flex h-12 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
            跨境贸易 ERP
          </span>
        )}
        {collapsed && <Box className="h-4 w-4 text-sidebar-foreground" />}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          aria-expanded={!collapsed}
          className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent md:inline-flex"
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
        {onMobileClose && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="关闭侧边栏"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && canUseQuickEntry(role) && (
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

      {setupStatus && !setupStatus.isCoreComplete ? (
        <div className="border-b border-sidebar-border p-2">
          <Link
            href="/setup"
            onClick={handleNavClick}
            title={collapsed ? "开始使用" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md bg-primary/10 px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/15",
              collapsed && "justify-center"
            )}
          >
            <ListChecks className="h-4 w-4 shrink-0" />
            {!collapsed ? (
              <>
                <span className="flex-1 truncate">开始使用</span>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] tabular-nums">
                  {setupStatus.completedCoreCount}/{setupStatus.coreStepCount}
                </span>
              </>
            ) : null}
          </Link>
        </div>
      ) : null}

      {collaboration.hasWarehouseCollaboration ? (
        <div className="border-b border-sidebar-border p-2">
          <Link
            href="/collaboration"
            onClick={handleNavClick}
            title={collapsed ? "外部任务协作" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              collaboration.pendingTaskCount > 0
                ? "bg-primary/10 font-medium text-primary hover:bg-primary/15"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
            )}
          >
            <PackageCheck className="h-4 w-4 shrink-0" />
            {!collapsed ? (
              <>
                <span className="flex-1 truncate">任务协作</span>
                <CountBadge count={collaboration.pendingTaskCount} />
              </>
            ) : null}
          </Link>
        </div>
      ) : null}

      <nav className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2">
        {visibleOperationsNavigation.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const dynamicSubmenu = item.href === "/inventory/sellable" ? sellablePallets : null;
                if (dynamicSubmenu && !collapsed) {
                  const isActive = isBranchActive(item);
                  const isExpanded = expandedItems.includes(item.name);
                  const marketViews = dynamicSubmenu.filter((sub) => sub.href !== item.href);
                  return (
                    <div key={item.href}>
                      <div
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Link
                          href={item.href}
                          onClick={handleNavClick}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <item.icon className={navIconClass(isActive)} />
                          <span className="flex-1 truncate text-left">{item.name}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.name)}
                          aria-label={`${isExpanded ? "收起" : "展开"}${item.name}`}
                          aria-expanded={isExpanded}
                          className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent"
                        >
                          <ChevronDown
                            className={cn("h-3 w-3 opacity-50", isExpanded && "rotate-180")}
                          />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                          {item.submenu?.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              aria-current={isHrefActive(sub.href, true) ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href, true)
                                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="flex-1 truncate">{sub.name}</span>
                              <CountBadge
                                count={sub.badgeKey && counts ? counts[sub.badgeKey] : 0}
                                critical={
                                  sub.badgeKey === "exception" ||
                                  sub.badgeKey === "inspectionException"
                                }
                              />
                            </Link>
                          ))}
                          {marketViews.length > 0 && (
                            <p className="px-2 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              可售市场视图
                            </p>
                          )}
                          {marketViews.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              aria-current={isHrefActive(sub.href, true) ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href, true)
                                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
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
                  const isActive = isBranchActive(item);
                  const isExpanded = expandedItems.includes(item.name);
                  return (
                    <div key={item.href}>
                      <div
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Link
                          href={item.href}
                          onClick={handleNavClick}
                          className="flex min-w-0 flex-1 items-center gap-2"
                        >
                          <item.icon className={navIconClass(isActive)} />
                          <span className="flex-1 truncate text-left">{item.name}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.name)}
                          aria-label={`${isExpanded ? "收起" : "展开"}${item.name}`}
                          aria-expanded={isExpanded}
                          className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent"
                        >
                          <ChevronDown
                            className={cn("h-3 w-3 opacity-50", isExpanded && "rotate-180")}
                          />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                          {item.submenu.map((sub) => (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              onClick={handleNavClick}
                              aria-current={isHrefActive(sub.href, true) ? "page" : undefined}
                              className={cn(
                                "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                                isHrefActive(sub.href, true)
                                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <span className="flex-1 truncate">{sub.name}</span>
                              <CountBadge
                                count={sub.badgeKey && counts ? counts[sub.badgeKey] : 0}
                                critical={
                                  sub.badgeKey === "exception" ||
                                  sub.badgeKey === "inspectionException"
                                }
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
                    critical={
                      item.badgeKey === "exception" || item.badgeKey === "inspectionException"
                    }
                    onClick={handleNavClick}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <Link
          href={settingsHref}
          onClick={handleNavClick}
          title={collapsed ? "设置" : undefined}
          aria-current={settingsActive ? "page" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            collapsed && "justify-center",
            settingsActive
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          <Settings2 className={navIconClass(settingsActive)} />
          {!collapsed ? <span className="truncate">设置</span> : null}
        </Link>
      </div>
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
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="关闭主导航"
            className="absolute inset-0 h-full w-full bg-black/40"
            onClick={onMobileClose}
          />
          <aside
            ref={mobileDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="主导航"
            className="relative flex h-full w-56 flex-col border-r bg-sidebar shadow-xl"
          >
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}

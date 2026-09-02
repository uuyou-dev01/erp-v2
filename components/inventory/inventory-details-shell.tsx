import type { ReactNode } from "react";
import Link from "next/link";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type InventoryDetailsTab = "lots" | "items";

const inventoryTabs: Array<{
  id: InventoryDetailsTab;
  label: string;
  description: string;
  href: string;
}> = [
  {
    id: "lots",
    label: "批次库存",
    description: "按数量查看批次、来源与成本",
    href: "/inventory/lots",
  },
  {
    id: "items",
    label: "单件库存",
    description: "逐件查看标签、成色与状态",
    href: "/inventory/items",
  },
];

export function InventoryDetailsShell({
  activeTab,
  role,
  actions,
  children,
}: {
  activeTab: InventoryDetailsTab;
  role: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const visibleTabs = inventoryTabs.filter((tab) => isNavigationHrefAllowed(role, tab.href));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">库存明细</h1>
          <p className="mt-1 text-muted-foreground">
            批次库存按数量管理，单件库存用于跟踪需要独立身份的实物。
          </p>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b" role="tablist" aria-label="库存明细类型">
        {visibleTabs.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              role="tab"
              aria-selected={active}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative min-w-36 shrink-0 px-3 pb-3 pt-1 transition-colors",
                active
                  ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="block text-sm font-medium">{tab.label}</span>
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                {tab.description}
              </span>
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

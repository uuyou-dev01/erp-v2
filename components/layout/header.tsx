"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Bell, Building2, LogIn, LogOut, Menu, Search, Settings2, UserRound } from "lucide-react";
import { getMyNotificationSummary } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";
import {
  clearCurrentUser,
  switchActiveOrganizationAction,
  switchActiveStoreAction,
} from "@/app/actions/session";
import { useRouter } from "next/navigation";
import { settingsAreaRoutes } from "@/config/navigation";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";

interface HeaderProps {
  role: string;
  onMenuClick?: () => void;
  onCommandOpen?: () => void;
  stores: Array<{ id: string; name: string }>;
  activeStoreId: string;
  organizations: Array<{ id: string; name: string }>;
  activeOrganizationId: string;
  account: {
    name: string;
    email: string;
    organizationName: string;
  };
}

export function Header({
  role,
  onMenuClick,
  onCommandOpen,
  stores,
  activeStoreId,
  organizations,
  activeOrganizationId,
  account,
}: HeaderProps) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getMyNotificationSummary()
      .then((summary) => {
        if (!cancelled) setUnreadCount(summary.unreadCount);
      })
      .catch(() => {
        if (!cancelled) setUnreadCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  const initials = (account.name || account.email).trim().slice(0, 1).toUpperCase();
  const activeStoreName = stores.find((store) => store.id === activeStoreId)?.name ?? "当前店铺";
  const companySettingsHref = settingsAreaRoutes["/settings/company"].find((href) =>
    isNavigationHrefAllowed(role, href)
  );
  const systemSettingsHref = settingsAreaRoutes["/settings/system"].find((href) =>
    isNavigationHrefAllowed(role, href)
  );

  return (
    <header className="relative z-50 flex h-12 shrink-0 items-center gap-4 border-b bg-background px-4">
      <button
        type="button"
        aria-label="打开主导航"
        onClick={onMenuClick}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground md:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <button
        type="button"
        aria-label="打开全局搜索"
        onClick={onCommandOpen}
        className="relative hidden h-8 max-w-md flex-1 items-center rounded-md border bg-muted/40 text-left text-sm text-muted-foreground md:flex"
      >
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <span className="pl-8">搜索商品、订单、物流单号...</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {organizations.length > 1 ? (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="text-[11px] font-medium text-muted-foreground">企业</span>
            <select
              aria-label="当前经营主体"
              className="h-8 max-w-48 rounded-md border bg-background px-2 text-xs font-medium"
              value={activeOrganizationId}
              onChange={async (event) => {
                setStoreError(null);
                const result = await switchActiveOrganizationAction(event.target.value);
                if (!result.success) {
                  setStoreError(result.error);
                  return;
                }
                router.refresh();
              }}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {stores.length > 1 ? (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="text-[11px] font-medium text-muted-foreground">店铺</span>
            <select
              aria-label="当前店铺"
              className="h-8 max-w-48 rounded-md border bg-background px-2 text-xs"
              value={activeStoreId}
              onChange={async (event) => {
                setStoreError(null);
                const result = await switchActiveStoreAction(event.target.value);
                if (!result.success) {
                  setStoreError(result.error);
                  return;
                }
                router.refresh();
              }}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            {storeError ? <span className="text-xs text-destructive">{storeError}</span> : null}
          </label>
        ) : null}
        <Link
          href="/notifications"
          aria-label="通知"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "relative h-8 w-8 text-muted-foreground"
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Link>
        <div ref={accountMenuRef} className="relative">
          <button
            type="button"
            aria-label="个人与账号设置"
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            onClick={() => setAccountMenuOpen((open) => !open)}
            className="flex h-8 items-center gap-2 rounded-md px-1.5 text-sm transition-colors hover:bg-accent"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
              {initials}
            </span>
            <span className="hidden max-w-24 truncate text-xs font-medium lg:block">
              {account.name || account.email}
            </span>
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {accountMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-10 z-50 w-64 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
            >
              <div className="border-b px-3 py-3">
                <p className="truncate text-sm font-medium">{account.name || "未设置姓名"}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{account.email}</p>
                <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  {account.organizationName} · {activeStoreName}
                </p>
              </div>
              <div role="none" className="space-y-3 border-b px-3 py-3 sm:hidden">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  当前工作空间
                </p>
                {organizations.length > 1 ? (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>经营主体</span>
                    <select
                      aria-label="移动端当前经营主体"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={activeOrganizationId}
                      onChange={async (event) => {
                        setStoreError(null);
                        const result = await switchActiveOrganizationAction(event.target.value);
                        if (!result.success) {
                          setStoreError(result.error);
                          return;
                        }
                        router.refresh();
                      }}
                    >
                      {organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {stores.length > 1 ? (
                  <label className="block space-y-1.5 text-xs font-medium">
                    <span>店铺</span>
                    <select
                      aria-label="移动端当前店铺"
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={activeStoreId}
                      onChange={async (event) => {
                        setStoreError(null);
                        const result = await switchActiveStoreAction(event.target.value);
                        if (!result.success) {
                          setStoreError(result.error);
                          return;
                        }
                        router.refresh();
                      }}
                    >
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {storeError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {storeError}
                  </p>
                ) : null}
              </div>
              <div className="p-1.5">
                <Link
                  role="menuitem"
                  href="/settings/personal"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                >
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                  个人与账号设置
                </Link>
                {companySettingsHref ? (
                  <Link
                    role="menuitem"
                    href={companySettingsHref}
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                  >
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    企业设置
                  </Link>
                ) : null}
                {systemSettingsHref ? (
                  <Link
                    role="menuitem"
                    href={systemSettingsHref}
                    onClick={() => setAccountMenuOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                  >
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    系统设置
                  </Link>
                ) : null}
              </div>
              <div className="border-t p-1.5">
                <Link
                  role="menuitem"
                  href="/login"
                  onClick={() => setAccountMenuOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent"
                >
                  <LogIn className="h-4 w-4 text-muted-foreground" />
                  切换账号
                </Link>
                <form action={clearCurrentUser}>
                  <button
                    type="submit"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

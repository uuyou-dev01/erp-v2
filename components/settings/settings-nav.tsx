"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, SlidersHorizontal, UserRound } from "lucide-react";
import { settingsAreaRoutes } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";

const settingAreas = [
  {
    name: "个人设置",
    href: "/settings/personal",
    icon: UserRound,
    matches: settingsAreaRoutes["/settings/personal"],
  },
  {
    name: "企业设置",
    href: "/settings/company",
    icon: Building2,
    matches: settingsAreaRoutes["/settings/company"],
  },
  {
    name: "系统设置",
    href: "/settings/system",
    icon: SlidersHorizontal,
    matches: settingsAreaRoutes["/settings/system"],
  },
];

export function SettingsNav({ role }: { role: string }) {
  const pathname = usePathname();
  const visibleSettingAreas = settingAreas.flatMap((area) => {
    const allowedHref = area.matches.find((href) => isNavigationHrefAllowed(role, href));
    return allowedHref ? [{ ...area, href: allowedHref }] : [];
  });

  return (
    <nav aria-label="设置分类" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {visibleSettingAreas.map((area) => {
        const active = area.matches.some(
          (path) => pathname === path || pathname.startsWith(`${path}/`)
        );
        return (
          <Link
            key={area.href}
            href={area.href}
            className={cn(
              "relative flex h-10 shrink-0 items-center gap-2 px-3 text-sm transition-colors",
              active
                ? "font-medium text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <area.icon className="h-4 w-4" />
            {area.name}
          </Link>
        );
      })}
    </nav>
  );
}

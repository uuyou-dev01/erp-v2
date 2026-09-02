import Link from "next/link";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type ProductWorkspaceView = "catalog" | "captures" | "market";

const productWorkspaceItems: Array<{
  id: ProductWorkspaceView;
  label: string;
  href: string;
}> = [
  { id: "catalog", label: "商品资料", href: "/inventory/skus" },
  { id: "captures", label: "待整理采集", href: "/product-intelligence/captures" },
  { id: "market", label: "市场参考", href: "/product-intelligence" },
];

export function ProductWorkspaceNav({
  active,
  role,
}: {
  active: ProductWorkspaceView;
  role: string;
}) {
  const visibleItems = productWorkspaceItems.filter((item) =>
    isNavigationHrefAllowed(role, item.href)
  );

  if (visibleItems.length <= 1) return null;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label="商品资料工作区">
      {visibleItems.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          aria-current={active === item.id ? "page" : undefined}
          className={cn(
            "relative shrink-0 px-3 py-2 text-sm font-medium transition-colors",
            active === item.id
              ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

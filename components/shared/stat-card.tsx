import { type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  href?: string;
}

export function StatCard({ title, value, subtitle, icon: Icon, iconColor, href }: StatCardProps) {
  const content = (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        href && "hover:bg-muted/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <Icon className={cn("h-4 w-4 text-muted-foreground", iconColor)} />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

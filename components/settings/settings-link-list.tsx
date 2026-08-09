import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type SettingsLinkItem = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export function SettingsLinkList({ items }: { items: SettingsLinkItem[] }) {
  return (
    <div className="divide-y rounded-lg border bg-background">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
            <item.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>
      ))}
    </div>
  );
}

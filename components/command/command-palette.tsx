"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { searchProductTickets, type CommandSearchResult } from "@/app/actions/workbench";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { commandQuickActions } from "@/config/navigation";
import { isNavigationHrefAllowed } from "@/lib/auth/permissions";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
}

export function CommandPalette({ open, onOpenChange, role }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandSearchResult[]>([]);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setResults([]);
      return;
    }
    startTransition(async () => {
      setResults(await searchProductTickets(query));
    });
  }, [open, query]);

  const items = useMemo<CommandSearchResult[]>(
    () => (query.trim() ? results : commandQuickActions).filter((item) =>
      isNavigationHrefAllowed(role, item.href),
    ),
    [query, results, role]
  );
  if (!open) return null;

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/20 p-4" onClick={() => onOpenChange(false)}>
      <div
        className="mx-auto mt-20 w-full max-w-xl overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b p-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索商品、SKU、订单号、物流单号..."
            className="border-0 shadow-none focus-visible:ring-0"
          />
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-2">
          {pending && <p className="px-3 py-2 text-sm text-muted-foreground">搜索中...</p>}
          {!pending && items.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有找到结果</p>
          )}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="flex w-full flex-col rounded-md px-3 py-2 text-left hover:bg-muted"
              onClick={() => go(item.href)}
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-xs text-muted-foreground">{item.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

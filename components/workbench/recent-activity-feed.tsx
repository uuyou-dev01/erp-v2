"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";

const COLLAPSED_ITEM_COUNT = 5;

export interface ActivityFeedItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  href?: string;
}

interface RecentActivityFeedProps {
  items: ActivityFeedItem[];
}

export function RecentActivityFeed({ items }: RecentActivityFeedProps) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无最近操作</p>;
  }

  const canExpand = items.length > COLLAPSED_ITEM_COUNT;
  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_ITEM_COUNT);

  return (
    <div>
      <div
        className={
          expanded
            ? "max-h-[min(60vh,560px)] space-y-1 overflow-y-auto overscroll-contain pr-1"
            : "space-y-1"
        }
      >
        {visibleItems.map((item) => {
          const content = (
            <div className="flex gap-3 rounded-lg px-2 py-2 transition hover:bg-muted/40">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground/80">
                  {new Date(item.timestamp).toLocaleString("zh-CN")}
                </p>
              </div>
            </div>
          );
          if (item.href) {
            return (
              <Link key={item.id} href={item.href}>
                {content}
              </Link>
            );
          }
          return <div key={item.id}>{content}</div>;
        })}
      </div>

      {canExpand ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border-t px-2 pt-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          {expanded ? (
            <>
              收起最近操作
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              查看其余 {items.length - COLLAPSED_ITEM_COUNT} 条
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

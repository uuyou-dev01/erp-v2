"use client";

import Link from "next/link";
import { Clock } from "lucide-react";

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
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无最近操作</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const content = (
          <div className="flex gap-3 rounded-lg px-2 py-2 transition hover:bg-muted/40">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
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
  );
}

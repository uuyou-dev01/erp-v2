"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVisibleRefresh } from "./use-visible-refresh";
export function NotificationRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const refresh = useVisibleRefresh(() => {
    if (!pending) startTransition(() => router.refresh());
  });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>页面可见时每 30 秒更新；回到此窗口时立即检查。</span>
      <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={pending}>
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "刷新中…" : "刷新通知"}
      </Button>
    </div>
  );
}

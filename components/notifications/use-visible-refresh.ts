"use client";
import { useCallback, useEffect, useRef } from "react";

/** Refresh lightweight data only; never remount an active business form. */
export function useVisibleRefresh(
  callback: () => void | Promise<void>,
  { intervalMs = 30000, refreshKey = "" }: { intervalMs?: number | null; refreshKey?: string } = {}
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const busy = useRef(false);
  const queued = useRef(false);
  const refresh = useCallback(async () => {
    const isHidden = () => document.visibilityState === "hidden";
    if (isHidden()) return;
    if (busy.current) {
      queued.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        queued.current = false;
        await callbackRef.current();
      } while (queued.current && !isHidden());
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => {
      void refresh();
    };
    const timer = intervalMs === null ? null : setInterval(handler, intervalMs);
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("erp:data-changed", handler);
    return () => {
      if (timer !== null) clearInterval(timer);
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("erp:data-changed", handler);
    };
  }, [refresh, intervalMs, refreshKey]);
  return refresh;
}

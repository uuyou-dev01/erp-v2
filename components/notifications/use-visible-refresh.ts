"use client";
import { useCallback, useEffect, useRef } from "react";

/** Refresh lightweight data only; never remount an active business form. */
export function useVisibleRefresh(callback: () => void | Promise<void>) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const busy = useRef(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden" || busy.current) return;
    busy.current = true;
    try {
      await callbackRef.current();
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => {
      void refresh();
    };
    const timer = setInterval(handler, 30000);
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("erp:data-changed", handler);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("erp:data-changed", handler);
    };
  }, [refresh]);
  return refresh;
}

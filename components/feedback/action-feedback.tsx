"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export function showActionSuccess(message: string) {
  window.dispatchEvent(new CustomEvent("erp:feedback", { detail: message }));
  window.dispatchEvent(new Event("erp:data-changed"));
}

export function ActionFeedback() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (event: Event) => {
      setMessage((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setMessage(null), 6000);
    };
    window.addEventListener("erp:feedback", handler);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("erp:feedback", handler);
    };
  }, []);
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-4 top-4 z-[150] flex justify-center"
    >
      {message && (
        <div
          role="status"
          aria-label="操作结果"
          className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950 shadow-lg"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span>{message}</span>
          <button aria-label="关闭成功提示" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

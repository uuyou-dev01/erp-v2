"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { reportDay } from "@/lib/application/operating-report-math";

const RANGES = [
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "thisQuarter", label: "本季度" },
] as const;

function DateRangePickerInner({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const currentRange = searchParams.get("range") || "thisMonth";
  const navigate = (params: URLSearchParams) =>
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <div className="flex items-center rounded-md border p-0.5">
        {RANGES.map(({ key, label }) => (
          <button
            key={key}
            disabled={pending}
            aria-pressed={currentRange === key}
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("range", key);
              params.delete("from");
              params.delete("to");
              setError("");
              navigate(params);
            }}
            className={`rounded px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${currentRange === key ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          const start = String(values.get("from"));
          const end = String(values.get("to"));
          if (start > end) {
            setError("开始日期不能晚于结束日期");
            return;
          }
          if (new Date(end).getTime() - new Date(start).getTime() > 366 * 86400000) {
            setError("单次最多查询 366 天");
            return;
          }
          setError("");
          const params = new URLSearchParams(searchParams.toString());
          params.set("range", "custom");
          params.set("from", start);
          params.set("to", end);
          navigate(params);
        }}
      >
        <label className="sr-only" htmlFor="report-from">
          开始日期
        </label>
        <input
          key={`from-${from}`}
          id="report-from"
          name="from"
          type="date"
          required
          defaultValue={from ?? `${reportDay(new Date()).slice(0, 7)}-01`}
          className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
        />
        <span className="text-sm text-muted-foreground">至</span>
        <label className="sr-only" htmlFor="report-to">
          结束日期
        </label>
        <input
          key={`to-${to}`}
          id="report-to"
          name="to"
          type="date"
          required
          defaultValue={to ?? reportDay(new Date())}
          className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm"
        />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "查询中…" : "查询"}
        </Button>
      </form>
      {error && (
        <span role="alert" className="text-sm text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
export function DateRangePicker(props: { from?: string; to?: string }) {
  return (
    <Suspense fallback={<span className="text-sm text-muted-foreground">加载日期筛选…</span>}>
      <DateRangePickerInner {...props} />
    </Suspense>
  );
}

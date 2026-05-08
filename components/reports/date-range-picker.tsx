"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Suspense } from "react";

const RANGES = [
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上月" },
  { key: "thisQuarter", label: "本季度" },
] as const;

function DateRangePickerInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const currentRange = searchParams.get("range") || "thisMonth";

  const setRange = (range: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", range);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex gap-1">
      {RANGES.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setRange(key)}
          className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
            currentRange === key
              ? "bg-brand-blue text-white"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function DateRangePicker() {
  return (
    <Suspense
      fallback={
        <div className="flex gap-1">
          {RANGES.map(({ key, label }) => (
            <span
              key={key}
              className="rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      }
    >
      <DateRangePickerInner />
    </Suspense>
  );
}

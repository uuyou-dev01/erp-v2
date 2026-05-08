"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  timeRanges?: string[];
  onTimeRangeChange?: (range: string) => void;
}

const DEFAULT_RANGES = ["本月", "上月", "本季度"];

export function ChartCard({ title, children, timeRanges = DEFAULT_RANGES, onTimeRangeChange }: ChartCardProps) {
  const [activeRange, setActiveRange] = useState(timeRanges[0]);

  const handleRangeChange = (range: string) => {
    setActiveRange(range);
    onTimeRangeChange?.(range);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle>{title}</CardTitle>
          {timeRanges.length > 0 && (
            <div className="flex gap-1">
              {timeRanges.map((range) => (
                <button
                  key={range}
                  onClick={() => handleRangeChange(range)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    activeRange === range
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  );
}

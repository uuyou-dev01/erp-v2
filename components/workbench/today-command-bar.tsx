"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, TableProperties } from "lucide-react";

interface TodayCommandBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onQuickEntry: () => void;
  onPasteImport: () => void;
}

export function TodayCommandBar({
  search,
  onSearchChange,
  onQuickEntry,
  onPasteImport,
}: TodayCommandBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="筛选待办..."
          className="h-8 bg-muted/30 pl-8 shadow-none"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPasteImport}>
          <TableProperties className="h-3.5 w-3.5" />
          粘贴导入
        </Button>
        <Button size="sm" onClick={onQuickEntry}>
          <Plus className="h-3.5 w-3.5" />
          快速录入
        </Button>
      </div>
    </div>
  );
}

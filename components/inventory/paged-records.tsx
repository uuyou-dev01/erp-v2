"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export function PagedRecords({
  headings,
  rows,
}: {
  headings: string[];
  rows: { id: string; cells: string[] }[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const filtered = rows.filter((row) =>
    row.cells.join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const current = Math.min(page, pages);
  return (
    <div className="space-y-3">
      <Input
        aria-label="搜索流水"
        placeholder="搜索订单、客户、平台…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setPage(1);
        }}
      />
      <div className="overflow-x-auto">
        <Table className="min-w-[620px]">
          <TableHeader>
            <TableRow>
              {headings.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice((current - 1) * 10, current * 10).map((row) => (
              <TableRow key={row.id}>
                {row.cells.map((cell, i) => (
                  <TableCell key={i}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {!filtered.length && <p className="text-sm text-muted-foreground">暂无匹配记录</p>}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          共 {filtered.length} 笔 · {current} / {pages} 页
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            上一页
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages}
            onClick={() => setPage(current + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}

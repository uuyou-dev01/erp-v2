"use client";

import { useState } from "react";
import { Check, Search } from "lucide-react";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPagination } from "@/components/ui/list-pagination";

export type SearchPickerOption = { id: string; name: string; detail?: string; group?: string };

/** Uses a modal so long product names remain readable even inside narrow tables. */
export function SearchPicker({
  id,
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder = "请选择",
}: {
  id?: string;
  label: string;
  value: string;
  options: SearchPickerOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [page, setPage] = useState(1);
  const selected = options.find((option) => option.id === value);
  const groups = [...new Set(options.map((option) => option.group).filter(Boolean))];
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = options.filter(
    (option) =>
      (!group || option.group === group) &&
      terms.every((term) =>
        `${option.name} ${option.detail ?? ""} ${option.group ?? ""}`
          .toLocaleLowerCase()
          .includes(term)
      )
  );
  const safePage = Math.min(page, Math.max(1, Math.ceil(matches.length / 20)));
  return (
    <>
      <Button
        id={id}
        type="button"
        variant="outline"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        className="h-auto min-h-9 w-full min-w-0 justify-start text-left font-normal"
        onClick={() => {
          setQuery("");
          setGroup("");
          setPage(1);
          setOpen(true);
        }}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 whitespace-normal break-words">
          {selected?.name || placeholder}
        </span>
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description="搜索名称、规格或编号，选择后继续填写。"
        size="lg"
      >
        <div className="space-y-3">
          <Input
            aria-label={`搜索${label}`}
            placeholder="输入名称、规格或编号…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          {groups.length > 1 && (
            <select
              aria-label="按系列或地区筛选"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部系列 / 地区</option>
              {groups.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <div className="max-h-[45dvh] overflow-y-auto rounded-lg border divide-y">
            {matches.slice((safePage - 1) * 20, safePage * 20).map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{option.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {[option.group, option.detail].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {option.id === value && (
                  <Check className="h-4 w-4 text-primary" aria-label="已选择" />
                )}
              </button>
            ))}
            {!matches.length && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                没有匹配项，请更换关键词。
              </p>
            )}
          </div>
          <ListPagination
            page={safePage}
            pageSize={20}
            total={matches.length}
            onPageChange={setPage}
          />
        </div>
      </ActionDialog>
    </>
  );
}

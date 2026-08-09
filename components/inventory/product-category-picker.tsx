"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  createOrganizationCategoryAction,
  getProductCategoryOptionsAction,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildCategoryChildrenMap,
  categorySearchText,
  type ProductCategoryOption,
} from "@/lib/application/product-categories";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";

const RECENT_KEY = "erp_recent_product_category_ids";

function readRecentIds() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function rememberCategory(id: string) {
  const next = [id, ...readRecentIds().filter((item) => item !== id)].slice(0, 5);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

interface CategoryTreeNodeProps {
  category: ProductCategoryOption;
  childrenMap: ReturnType<typeof buildCategoryChildrenMap>;
  expandedIds: Set<string>;
  visibleIds: Set<string> | null;
  selectedId?: string;
  searching: boolean;
  onToggle: (categoryId: string) => void;
  onSelect: (category: ProductCategoryOption) => void;
}

function CategoryTreeNode({
  category,
  childrenMap,
  expandedIds,
  visibleIds,
  selectedId,
  searching,
  onToggle,
  onSelect,
}: CategoryTreeNodeProps) {
  const children = (childrenMap.get(category.id) ?? []).filter(
    (child) => !visibleIds || visibleIds.has(child.id)
  );
  const hasChildren = children.length > 0;
  const expanded = searching || expandedIds.has(category.id);
  const selected = selectedId === category.id;
  const helperText = searching
    ? category.path
    : category.aliases.length > 0
      ? `别名：${category.aliases.slice(0, 2).join("、")}`
      : hasChildren
        ? `${children.length} 个子分类`
        : null;

  return (
    <div>
      <div
        className={cn(
          "group flex min-h-9 items-start rounded-md transition-colors hover:bg-muted",
          selected && "bg-primary/5"
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(category.id)}
            className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label={`${expanded ? "收起" : "展开"}${category.name}`}
            aria-expanded={expanded}
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onSelect(category)}
          className="flex min-w-0 flex-1 items-start gap-2 px-1.5 py-2 text-left"
        >
          {hasChildren ? (
            expanded ? (
              <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
            ) : (
              <Folder className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
          )}
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-sm", hasChildren && "font-medium")}>
              {category.name}
            </span>
            {helperText ? (
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                {helperText}
              </span>
            ) : null}
          </span>
          {selected ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
        </button>
      </div>

      {hasChildren && expanded ? (
        <div className="ml-3.5 border-l border-border/80 pl-3">
          {children.map((child) => (
            <div
              key={child.id}
              className="relative before:absolute before:-left-3 before:top-[18px] before:w-3 before:border-t before:border-border/80"
            >
              <CategoryTreeNode
                category={child}
                childrenMap={childrenMap}
                expandedIds={expandedIds}
                visibleIds={visibleIds}
                selectedId={selectedId}
                searching={searching}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

interface ProductCategoryPickerProps {
  value?: string | null;
  legacyValue?: string | null;
  onChange: (
    categoryId: string | null,
    categoryName: string,
    category?: ProductCategoryOption
  ) => void;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  allowCreate?: boolean;
  inheritedHint?: string;
}

export function ProductCategoryPicker({
  value,
  legacyValue,
  onChange,
  disabled = false,
  placeholder = "搜索或选择商品品类",
  compact = false,
  allowCreate = true,
  inheritedHint,
}: ProductCategoryPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<ProductCategoryOption[]>([]);
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createParentId, setCreateParentId] = useState("");
  const [createCanonicalId, setCreateCanonicalId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 0,
    width: 420,
  });

  const loadCategories = async () => {
    setLoading(true);
    try {
      setCategories(await getProductCategoryOptionsAction());
      setRecentIds(readRecentIds());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  useEffect(() => {
    if (categories.length === 0) return;
    setExpandedIds(
      new Set(
        categories
          .filter((category) => categories.some((item) => item.parentId === category.id))
          .map((category) => category.id)
      )
    );
  }, [categories]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        setCreating(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(520, window.innerWidth - 32);
      const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - width - 16));
      const estimatedHeight = creating ? 390 : 430;
      const top =
        rect.bottom + 6 + estimatedHeight <= window.innerHeight - 16
          ? rect.bottom + 6
          : Math.max(16, rect.top - estimatedHeight - 6);
      setPanelPosition({
        top,
        left,
        width,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [creating, open]);

  const selected = useMemo(
    () =>
      categories.find((category) => category.id === value) ??
      categories.find(
        (category) =>
          !value &&
          legacyValue &&
          (category.name === legacyValue || category.aliases.includes(legacyValue))
      ),
    [categories, legacyValue, value]
  );
  const activeCategories = useMemo(
    () => categories.filter((category) => category.status === "ACTIVE"),
    [categories]
  );
  const systemCategories = activeCategories.filter((category) => category.scope === "SYSTEM");
  const organizationCategories = activeCategories.filter(
    (category) => category.scope === "ORGANIZATION"
  );
  const categoryById = useMemo(
    () => new Map(activeCategories.map((category) => [category.id, category])),
    [activeCategories]
  );
  const childrenMap = useMemo(() => buildCategoryChildrenMap(activeCategories), [activeCategories]);
  const treeRoots = activeCategories.filter(
    (category) => !category.parentId || !categoryById.has(category.parentId)
  );
  const recentCategories = recentIds
    .map((id) => activeCategories.find((category) => category.id === id))
    .filter((category): category is ProductCategoryOption => Boolean(category));
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const matchingCategories = useMemo(
    () =>
      normalizedQuery
        ? activeCategories
            .filter((category) => categorySearchText(category).includes(normalizedQuery))
            .slice(0, 40)
        : activeCategories,
    [activeCategories, normalizedQuery]
  );
  const visibleIds = useMemo(() => {
    if (!normalizedQuery) return null;
    const next = new Set<string>();
    for (const category of matchingCategories) {
      let current: ProductCategoryOption | undefined = category;
      while (current) {
        next.add(current.id);
        current = current.parentId ? categoryById.get(current.parentId) : undefined;
      }
    }
    return next;
  }, [categoryById, matchingCategories, normalizedQuery]);
  const visibleRoots = treeRoots.filter((category) => !visibleIds || visibleIds.has(category.id));
  const systemRoots = visibleRoots.filter((category) => category.scope === "SYSTEM");
  const organizationRoots = visibleRoots.filter((category) => category.scope === "ORGANIZATION");

  const toggleCategory = (categoryId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const selectCategory = (category: ProductCategoryOption) => {
    rememberCategory(category.id);
    setRecentIds(readRecentIds());
    onChange(category.id, category.name, category);
    setOpen(false);
    setCreating(false);
    setQuery("");
  };

  const handleCreate = () => {
    const name = createName.trim();
    if (!name) {
      setCreateError("请填写企业品类名称");
      return;
    }
    setCreateError(null);
    startTransition(async () => {
      const result = await createOrganizationCategoryAction({
        name,
        parentId: createParentId || null,
        canonicalCategoryId: createCanonicalId || null,
      });
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      const next = await getProductCategoryOptionsAction();
      setCategories(next);
      const created = next.find((category) => category.id === result.id);
      if (created) selectCategory(created);
      setCreateName("");
      setCreateParentId("");
      setCreateCanonicalId("");
      setCreating(false);
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((current) => !current);
          setCreating(false);
        }}
        className={cn(
          "flex w-full items-center justify-between rounded-md border border-input bg-background px-3 text-left shadow-sm transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          compact ? "h-8 text-xs" : "h-9 text-sm"
        )}
      >
        <span
          className={cn("min-w-0 truncate", !selected && !legacyValue && "text-muted-foreground")}
        >
          {selected?.path || legacyValue || placeholder}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {inheritedHint ? <p className="mt-1 text-xs text-emerald-700">{inheritedHint}</p> : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              className="fixed z-[1100] max-h-[min(560px,calc(100vh-32px))] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
              style={panelPosition}
            >
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="pl-9 pr-9"
                    placeholder="搜索名称、别名或完整路径"
                    autoFocus
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                      aria-label="清空搜索"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                {!query && recentCategories.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">最近使用</span>
                    {recentCategories.map((category) => (
                      <button
                        key={`recent-${category.id}`}
                        type="button"
                        onClick={() => selectCategory(category)}
                        className="max-w-40 truncate rounded-md bg-muted px-2 py-1 text-[11px] hover:bg-muted/80"
                        title={category.path}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {creating ? (
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-sm font-semibold">新建企业品类</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      企业品类用于你们自己的管理习惯，并可关联一项系统标准品类。
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">品类名称</Label>
                    <Input
                      value={createName}
                      onChange={(event) => setCreateName(event.target.value)}
                      placeholder="例如：POP MART、露营小物"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">企业父品类</Label>
                      <select
                        value={createParentId}
                        onChange={(event) => {
                          setCreateParentId(event.target.value);
                          const parent = organizationCategories.find(
                            (category) => category.id === event.target.value
                          );
                          if (parent?.canonicalCategoryId) {
                            setCreateCanonicalId(parent.canonicalCategoryId);
                          }
                        }}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">作为企业大类</option>
                        {organizationCategories
                          .filter((category) => category.level < 3)
                          .map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.path}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">对应系统标准</Label>
                      <select
                        value={createCanonicalId}
                        onChange={(event) => setCreateCanonicalId(event.target.value)}
                        className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">暂不关联</option>
                        {systemCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.path}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {createError ? (
                    <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {createError}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCreating(false)}
                      disabled={isPending}
                    >
                      返回选择
                    </Button>
                    <Button type="button" size="sm" onClick={handleCreate} disabled={isPending}>
                      {isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      创建并选择
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="max-h-80 overflow-y-auto p-1.5">
                    {loading ? (
                      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        正在载入品类
                      </div>
                    ) : visibleRoots.length === 0 ? (
                      <div className="px-3 py-8 text-center">
                        <p className="text-sm font-medium">没有找到对应品类</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          可以换个关键词，或建立企业自己的品类。
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {systemRoots.length > 0 ? (
                          <section>
                            <div className="flex h-7 items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              系统标准
                              <span className="h-px flex-1 bg-border/70" />
                            </div>
                            {systemRoots.map((category) => (
                              <CategoryTreeNode
                                key={category.id}
                                category={category}
                                childrenMap={childrenMap}
                                expandedIds={expandedIds}
                                visibleIds={visibleIds}
                                selectedId={selected?.id}
                                searching={Boolean(normalizedQuery)}
                                onToggle={toggleCategory}
                                onSelect={selectCategory}
                              />
                            ))}
                          </section>
                        ) : null}
                        {organizationRoots.length > 0 ? (
                          <section>
                            <div className="flex h-7 items-center gap-2 px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              企业自定义
                              <span className="h-px flex-1 bg-border/70" />
                            </div>
                            {organizationRoots.map((category) => (
                              <CategoryTreeNode
                                key={category.id}
                                category={category}
                                childrenMap={childrenMap}
                                expandedIds={expandedIds}
                                visibleIds={visibleIds}
                                selectedId={selected?.id}
                                searching={Boolean(normalizedQuery)}
                                onToggle={toggleCategory}
                                onSelect={selectCategory}
                              />
                            ))}
                          </section>
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-1">
                      {(selected || legacyValue) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-muted-foreground"
                          onClick={() => {
                            onChange(null, "");
                            setOpen(false);
                          }}
                        >
                          清除
                        </Button>
                      )}
                      <Link
                        href="/settings/categories"
                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        品类管理
                      </Link>
                    </div>
                    {allowCreate ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          setCreating(true);
                          setCreateName(query);
                          setCreateError(null);
                        }}
                      >
                        <FolderPlus className="mr-1 h-3.5 w-3.5" />
                        新建企业品类
                      </Button>
                    ) : null}
                  </div>
                </>
              )}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOrganizationCategoryAction,
  deleteOrganizationCategoryAction,
  updateOrganizationCategoryAction,
} from "@/app/actions/categories";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
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
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";

interface ProductCategoryManagerProps {
  categories: ProductCategoryOption[];
}

function descendantsOf(
  categoryId: string,
  childrenMap: ReturnType<typeof buildCategoryChildrenMap>
) {
  const ids = new Set<string>();
  const visit = (id: string) => {
    for (const child of childrenMap.get(id) ?? []) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      visit(child.id);
    }
  };
  visit(categoryId);
  return ids;
}

function categoryForm(category?: ProductCategoryOption) {
  return {
    name: category?.name ?? "",
    aliases: category?.aliases.join("、") ?? "",
    parentId: category?.parentId ?? "",
    canonicalCategoryId: category?.canonicalCategoryId ?? "",
    status: category?.status === "INACTIVE" ? ("INACTIVE" as const) : ("ACTIVE" as const),
  };
}

export function ProductCategoryManager({ categories }: ProductCategoryManagerProps) {
  const router = useRouter();
  const initialSelected =
    categories.find((category) => category.scope === "SYSTEM") ?? categories[0];
  const treeRef = useRef<HTMLDivElement>(null);
  const revealCreatedId = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState(initialSelected?.id ?? "");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"ALL" | "SYSTEM" | "ORGANIZATION">("ALL");
  const [collapsedIds, setCollapsedIds] = useState(new Set<string>());
  const [draft, setDraft] = useState<{ parentId: string | null; name: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductCategoryOption | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(() => categoryForm(initialSelected));

  useEffect(() => {
    const container = treeRef.current;
    const id = revealCreatedId.current;
    if (!container || !id) return;
    const node = container.querySelector<HTMLElement>(`[data-category-id="${CSS.escape(id)}"]`);
    if (!node) return;
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    revealCreatedId.current = null;
  }, [categories, selectedId]);

  const selected = categories.find((category) => category.id === selectedId);
  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const childrenMap = useMemo(() => buildCategoryChildrenMap(categories), [categories]);
  const hiddenParentIds = selected ? descendantsOf(selected.id, childrenMap) : new Set<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  // Keep ancestors visible so filtering never loses the location of a matching node.
  const visibleIds = new Set<string>();
  for (const category of categories) {
    if (scope !== "ALL" && category.scope !== scope) continue;
    if (normalizedQuery && !categorySearchText(category).includes(normalizedQuery)) continue;
    let current: ProductCategoryOption | undefined = category;
    while (current && !visibleIds.has(current.id)) {
      visibleIds.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const filtering = Boolean(normalizedQuery) || scope !== "ALL";
  const systemCategories = categories.filter(
    (category) => category.scope === "SYSTEM" && category.status === "ACTIVE"
  );

  const selectCategory = (category: ProductCategoryOption) => {
    setSelectedId(category.id);
    setForm(categoryForm(category));
    setMessage(null);
    setDraft(null);
    setCreateError(null);
  };

  const beginCreate = (parent?: ProductCategoryOption) => {
    setQuery("");
    setScope("ALL");
    setCreateError(null);
    setMessage(null);
    if (parent) {
      setSelectedId(parent.id);
      setForm(categoryForm(parent));
      setCollapsedIds((current) => {
        const next = new Set(current);
        let node: ProductCategoryOption | undefined = parent;
        while (node) {
          next.delete(node.id);
          node = node.parentId ? byId.get(node.parentId) : undefined;
        }
        return next;
      });
    }
    setDraft({ parentId: parent?.id ?? null, name: "" });
  };

  const createCategory = () => {
    if (!draft || !draft.name.trim()) return;
    const submitted = draft;
    setCreateError(null);
    startTransition(async () => {
      const parent = submitted.parentId ? byId.get(submitted.parentId) : undefined;
      const result = await createOrganizationCategoryAction({
        name: submitted.name,
        parentId: submitted.parentId,
        canonicalCategoryId: parent?.scope === "SYSTEM" ? parent.id : parent?.canonicalCategoryId,
      });
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      revealCreatedId.current = result.id;
      setSelectedId(result.id);
      setForm({
        ...categoryForm(),
        name: submitted.name.trim(),
        parentId: submitted.parentId ?? "",
        canonicalCategoryId:
          parent?.scope === "SYSTEM" ? parent.id : (parent?.canonicalCategoryId ?? ""),
      });
      setDraft(null);
      setMessage("已创建品类，可在右侧补充信息");
      router.refresh();
    });
  };

  const saveCategory = () => {
    if (!selected || selected.scope !== "ORGANIZATION") return;
    setMessage(null);
    startTransition(async () => {
      const result = await updateOrganizationCategoryAction({
        id: selected.id,
        ...form,
        parentId: form.parentId || null,
        canonicalCategoryId: form.canonicalCategoryId || null,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setMessage("已保存");
      router.refresh();
    });
  };

  const deleteCategory = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteOrganizationCategoryAction(target.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      if (selectedId === target.id) {
        const next =
          categories.find((category) => category.id === target.parentId) ??
          categories.find((category) => category.id !== target.id);
        setSelectedId(next?.id ?? "");
        setForm(categoryForm(next));
      }
      setDeleteTarget(null);
      setDraft(null);
      setMessage("已删除品类");
      router.refresh();
    });
  };

  const renderCreate = (parentId: string | null) =>
    draft?.parentId === parentId ? (
      <form
        className="my-2 space-y-2 rounded-lg border border-primary/30 bg-primary/[0.03] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          createCategory();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !isPending) {
            setDraft(null);
            setCreateError(null);
          }
        }}
      >
        <Label htmlFor="new-category-name" className="block text-xs leading-5">
          {parentId ? `在「${byId.get(parentId)?.name}」下新增子品类` : "新增顶级企业品类"}
        </Label>
        {parentId ? (
          <p className="break-words text-[11px] text-muted-foreground">
            {byId.get(parentId)?.path} / 新品类
          </p>
        ) : null}
        <Input
          id="new-category-name"
          autoFocus
          value={draft.name}
          disabled={isPending}
          placeholder="输入品类名称"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        {createError ? (
          <p role="alert" className="text-xs text-destructive">
            {createError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              setDraft(null);
              setCreateError(null);
            }}
          >
            取消
          </Button>
          <Button type="submit" size="sm" disabled={isPending || !draft.name.trim()}>
            {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}创建品类
          </Button>
        </div>
      </form>
    ) : null;

  const renderNodes = (parentId: string | null): React.ReactNode =>
    (childrenMap.get(parentId) ?? [])
      .filter((category) => visibleIds.has(category.id))
      .map((category) => {
        const children = (childrenMap.get(category.id) ?? []).filter((child) =>
          visibleIds.has(child.id)
        );
        const expanded = filtering || !collapsedIds.has(category.id);
        const canCreate = category.status === "ACTIVE" && category.level < 3;
        return (
          <Fragment key={category.id}>
            <div
              data-category-id={category.id}
              className={cn(
                "flex min-h-10 items-center gap-1 rounded-lg pr-1 hover:bg-muted",
                selectedId === category.id && "bg-primary/5 text-primary"
              )}
            >
              {children.length ? (
                <button
                  type="button"
                  disabled={isPending || filtering}
                  aria-label={`${expanded ? "收起" : "展开"}${category.name}`}
                  aria-expanded={expanded}
                  className="flex h-8 w-6 shrink-0 items-center justify-center rounded hover:bg-muted"
                  onClick={() =>
                    setCollapsedIds((current) => {
                      const next = new Set(current);
                      if (next.has(category.id)) next.delete(category.id);
                      else next.add(category.id);
                      return next;
                    })
                  }
                >
                  <ChevronRight
                    className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")}
                  />
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <button
                type="button"
                disabled={isPending}
                onClick={() => selectCategory(category)}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                title={category.path}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      category.status !== "ACTIVE" && "text-muted-foreground"
                    )}
                  >
                    {category.name}
                  </span>
                  {normalizedQuery ? (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {category.path}
                    </span>
                  ) : null}
                </span>
                <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                  {category.status === "INACTIVE"
                    ? "停用"
                    : category.status === "MERGED"
                      ? "已合并"
                      : category.scope === "SYSTEM"
                        ? "系统"
                        : "企业"}
                </Badge>
              </button>
              {canCreate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-primary"
                  disabled={isPending}
                  aria-label={`在${category.name}下新增子品类`}
                  title="新增子品类"
                  onClick={() => beginCreate(category)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              ) : null}
              {category.scope === "ORGANIZATION" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  disabled={isPending}
                  aria-label={`删除${category.name}`}
                  title="删除品类"
                  onClick={() => {
                    setDeleteTarget(category);
                    setDeleteError(null);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
            {expanded || draft?.parentId === category.id ? (
              <div className="ml-3 border-l pl-3">
                {renderCreate(category.id)}
                {expanded ? renderNodes(category.id) : null}
              </div>
            ) : null}
          </Fragment>
        );
      });

  return (
    <>
      <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[minmax(360px,1fr)_minmax(360px,1fr)]">
        <section aria-label="品类结构" className="min-w-0 border-b lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">品类结构</h2>
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={isPending}
                onClick={() => beginCreate()}
              >
                <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                新增顶级品类
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              点击品类旁的 + 添加子品类，点击垃圾桶删除企业品类。
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="搜索品类"
                value={query}
                disabled={isPending}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setDraft(null);
                }}
                className="pl-9"
                placeholder="搜索名称、别名或路径"
              />
            </div>
            <div className="flex w-fit rounded-lg bg-muted p-0.5">
              {(
                [
                  ["ALL", "全部"],
                  ["SYSTEM", "系统标准"],
                  ["ORGANIZATION", "企业自定义"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={isPending}
                  aria-pressed={scope === value}
                  onClick={() => {
                    setScope(value);
                    setDraft(null);
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px] transition-colors",
                    scope === value
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === "ORGANIZATION" ? (
              <p className="text-[11px] text-muted-foreground">
                保留上级系统品类，方便查看企业品类的位置。
              </p>
            ) : null}
          </div>
          <div ref={treeRef} className="max-h-[640px] overflow-y-auto p-2">
            {renderCreate(null)}
            {visibleIds.size ? (
              renderNodes(null)
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                {categories.length ? "没有找到匹配的品类" : "暂无品类，点击上方按钮创建"}
              </p>
            )}
          </div>
        </section>
        <section aria-label="品类详情" className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">{selected?.name ?? "选择一个品类"}</h2>
                {selected?.scope === "SYSTEM" ? (
                  <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    系统标准
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {selected?.path ?? "在左侧新增品类或选择品类查看详情"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {["json", "csv"].map((format) => (
                <a
                  key={format}
                  href={`/api/v1/catalog/categories?format=${format}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  {format.toUpperCase()}
                </a>
              ))}
            </div>
          </div>
          {message ? (
            <p role="status" className="mx-5 mt-4 rounded-md bg-muted px-3 py-2 text-sm">
              {message}
            </p>
          ) : null}
          {selected?.scope === "SYSTEM" ? (
            <div className="space-y-6 p-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">标准编码</p>
                  <p className="mt-1 break-all font-mono text-sm">{selected.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">直接引用商品</p>
                  <p className="mt-1 text-sm font-medium">
                    {(selected.skuCount ?? 0) + (selected.intelligenceCount ?? 0)} 条
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">搜索别名</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.aliases.length ? (
                      selected.aliases.map((alias) => (
                        <Badge key={alias} variant="secondary">
                          {alias}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">暂无别名</span>
                    )}
                  </div>
                </div>
              </div>
              <p className="border-t pt-5 text-xs leading-5 text-muted-foreground">
                系统标准品类不可修改或删除。需要按企业习惯细分时，点击左侧品类旁的
                +，直接在其下创建企业子品类。
              </p>
            </div>
          ) : selected ? (
            <form
              className="space-y-5 p-5"
              onSubmit={(event) => {
                event.preventDefault();
                saveCategory();
              }}
            >
              <fieldset
                disabled={isPending || selected.status === "MERGED"}
                className="grid min-w-0 gap-4 sm:grid-cols-2"
              >
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="category-name">品类名称</Label>
                  <Input
                    id="category-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="category-aliases">别名</Label>
                  <Input
                    id="category-aliases"
                    value={form.aliases}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, aliases: event.target.value }))
                    }
                    placeholder="用逗号分隔，例如：服饰、衣服"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    搜索别名也能找到这个品类，但不会产生重复节点。
                  </p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="category-parent">上级品类</Label>
                  <select
                    id="category-parent"
                    value={form.parentId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        parentId: event.target.value,
                        canonicalCategoryId:
                          byId.get(event.target.value)?.scope === "SYSTEM"
                            ? event.target.value
                            : current.canonicalCategoryId,
                      }))
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">作为顶级品类</option>
                    {categories
                      .filter(
                        (category) =>
                          (category.status === "ACTIVE" &&
                            category.level < 3 &&
                            category.id !== selected.id &&
                            !hiddenParentIds.has(category.id)) ||
                          category.id === form.parentId
                      )
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.path}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="category-canonical">系统标准品类</Label>
                  <select
                    id="category-canonical"
                    value={form.canonicalCategoryId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        canonicalCategoryId: event.target.value,
                      }))
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">暂不关联</option>
                    {systemCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.path}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="category-status">状态</Label>
                  <select
                    id="category-status"
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as "ACTIVE" | "INACTIVE",
                      }))
                    }
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="ACTIVE">启用</option>
                    <option value="INACTIVE">停用（已有商品保留）</option>
                  </select>
                </div>
              </fieldset>
              {selected.status === "MERGED" ? (
                <p className="text-xs text-muted-foreground">此品类已合并，不能继续修改。</p>
              ) : (
                <div className="flex justify-end border-t pt-4">
                  <Button type="submit" disabled={isPending || !form.name.trim()}>
                    {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}保存修改
                  </Button>
                </div>
              )}
            </form>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`删除「${deleteTarget?.name ?? ""}」？`}
        description={`品类位置：${deleteTarget?.path ?? ""}。删除后无法恢复；有子品类、商品引用或其他品类关联时无法删除。`}
        confirmText="确认删除"
        tone="danger"
        loading={isPending}
        error={deleteError}
        onConfirm={deleteCategory}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </>
  );
}

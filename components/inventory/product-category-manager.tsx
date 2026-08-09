"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createOrganizationCategoryAction,
  updateOrganizationCategoryAction,
} from "@/app/actions/categories";
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
  Search,
  ShieldCheck,
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
      ids.add(child.id);
      visit(child.id);
    }
  };
  visit(categoryId);
  return ids;
}

export function ProductCategoryManager({ categories }: ProductCategoryManagerProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(
    categories.find((category) => category.scope === "SYSTEM")?.id ?? ""
  );
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"ALL" | "SYSTEM" | "ORGANIZATION">("ALL");
  const [mode, setMode] = useState<"VIEW" | "CREATE">("VIEW");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = categories.find((category) => category.id === selectedId) ?? categories[0];
  const systemCategories = categories.filter(
    (category) => category.scope === "SYSTEM" && category.status === "ACTIVE"
  );
  const organizationCategories = categories.filter((category) => category.scope === "ORGANIZATION");
  const childrenMap = useMemo(() => buildCategoryChildrenMap(categories), [categories]);
  const hiddenParentIds = selected ? descendantsOf(selected.id, childrenMap) : new Set<string>();
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const visibleCategories = categories.filter((category) => {
    if (scope !== "ALL" && category.scope !== scope) return false;
    if (normalizedQuery && !categorySearchText(category).includes(normalizedQuery)) {
      return false;
    }
    return true;
  });

  const [form, setForm] = useState({
    name: "",
    aliases: "",
    parentId: "",
    canonicalCategoryId: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
  });

  const syncForm = (category?: ProductCategoryOption) => {
    if (!category) return;
    setForm({
      name: category.name,
      aliases: category.aliases.join("、"),
      parentId: category.parentId ?? "",
      canonicalCategoryId: category.canonicalCategoryId ?? "",
      status: category.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    setMode("VIEW");
    setMessage(null);
  };

  const selectCategory = (category: ProductCategoryOption) => {
    setSelectedId(category.id);
    syncForm(category);
  };

  const beginCreate = () => {
    setMode("CREATE");
    setMessage(null);
    setForm({
      name: "",
      aliases: "",
      parentId:
        selected?.scope === "ORGANIZATION" && selected.status === "ACTIVE" ? selected.id : "",
      canonicalCategoryId:
        selected?.scope === "SYSTEM" ? selected.id : (selected?.canonicalCategoryId ?? ""),
      status: "ACTIVE",
    });
  };

  const submit = () => {
    setMessage(null);
    startTransition(async () => {
      const result =
        mode === "CREATE"
          ? await createOrganizationCategoryAction({
              name: form.name,
              aliases: form.aliases,
              parentId: form.parentId || null,
              canonicalCategoryId: form.canonicalCategoryId || null,
            })
          : await updateOrganizationCategoryAction({
              id: selected.id,
              name: form.name,
              aliases: form.aliases,
              parentId: form.parentId || null,
              canonicalCategoryId: form.canonicalCategoryId || null,
              status: form.status,
            });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setSelectedId(result.id);
      setMode("VIEW");
      setMessage("已保存");
      router.refresh();
    });
  };

  return (
    <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card lg:grid-cols-[minmax(320px,.8fr)_minmax(460px,1.2fr)]">
      <section className="border-b lg:border-b-0 lg:border-r">
        <div className="space-y-3 border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-9"
              placeholder="搜索名称、别名或路径"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              {[
                ["ALL", "全部"],
                ["SYSTEM", "系统标准"],
                ["ORGANIZATION", "企业自定义"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value as typeof scope)}
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
            <Button type="button" size="sm" className="h-8 text-xs" onClick={beginCreate}>
              <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
              新建
            </Button>
          </div>
        </div>

        <div className="max-h-[560px] overflow-y-auto p-2">
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => selectCategory(category)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left hover:bg-muted",
                selected?.id === category.id && mode !== "CREATE"
                  ? "bg-primary/5 text-primary"
                  : "text-foreground",
                category.status !== "ACTIVE" && "opacity-55"
              )}
              style={{ paddingLeft: `${10 + category.level * 18}px` }}
            >
              {category.level > 0 ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{category.name}</span>
                {normalizedQuery ? (
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {category.path}
                  </span>
                ) : null}
              </span>
              <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
                {category.scope === "SYSTEM" ? "系统" : "企业"}
              </Badge>
            </button>
          ))}
        </div>
      </section>

      <section className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">
                {mode === "CREATE" ? "新建企业品类" : (selected?.name ?? "选择一个品类")}
              </h2>
              {mode !== "CREATE" && selected?.scope === "SYSTEM" ? (
                <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                  <ShieldCheck className="mr-1 h-3 w-3" />
                  系统标准
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {mode === "CREATE"
                ? "企业品类只影响当前组织，并可关联到系统标准分类。"
                : selected?.path}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <a
              href="/api/v1/catalog/categories?format=json"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              JSON
            </a>
            <a
              href="/api/v1/catalog/categories?format=csv"
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </a>
          </div>
        </div>

        {mode !== "CREATE" && selected?.scope === "SYSTEM" ? (
          <div className="space-y-6 p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">标准编码</p>
                <p className="mt-1 font-mono text-sm">{selected.code}</p>
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
                  {selected.aliases.length > 0 ? (
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
            <div className="border-t pt-5">
              <h3 className="text-sm font-semibold">按企业习惯细分</h3>
              <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                系统标准品类保持稳定。如果你们需要“POP
                MART”“露营小物”等内部口径，请建立企业品类并关联到当前标准节点。
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={beginCreate}
              >
                <FolderPlus className="mr-1.5 h-4 w-4" />
                建立关联企业品类
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>品类名称</Label>
                <Input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="例如：POP MART、露营小物"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>别名</Label>
                <Input
                  value={form.aliases}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      aliases: event.target.value,
                    }))
                  }
                  placeholder="用逗号分隔，例如：服饰、衣服"
                />
                <p className="text-[11px] text-muted-foreground">
                  搜索别名也能找到这个品类，但不会产生重复节点。
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>企业父品类</Label>
                <select
                  value={form.parentId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      parentId: event.target.value,
                    }))
                  }
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">作为企业大类</option>
                  {organizationCategories
                    .filter(
                      (category) =>
                        category.status === "ACTIVE" &&
                        category.level < 3 &&
                        category.id !== selected?.id &&
                        !hiddenParentIds.has(category.id)
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.path}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>系统标准品类</Label>
                <select
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
              {mode !== "CREATE" ? (
                <div className="space-y-1.5">
                  <Label>状态</Label>
                  <select
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
              ) : null}
            </div>

            {message ? (
              <p
                className={cn(
                  "rounded-md px-3 py-2 text-xs",
                  message === "已保存"
                    ? "bg-emerald-500/10 text-emerald-700"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {message}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              {mode === "CREATE" ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMode("VIEW");
                    syncForm(selected);
                  }}
                  disabled={isPending}
                >
                  取消
                </Button>
              ) : null}
              <Button type="button" onClick={submit} disabled={isPending || !form.name.trim()}>
                {isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                {mode === "CREATE" ? "创建品类" : "保存修改"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

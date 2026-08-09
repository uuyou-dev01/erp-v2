export type ProductCategoryScope = "SYSTEM" | "ORGANIZATION";
export type ProductCategoryStatus = "ACTIVE" | "INACTIVE" | "MERGED";

export interface ProductCategoryOption {
  id: string;
  scope: ProductCategoryScope;
  organizationId: string | null;
  parentId: string | null;
  canonicalCategoryId: string | null;
  code: string;
  name: string;
  aliases: string[];
  path: string;
  level: number;
  sortOrder: number;
  status: ProductCategoryStatus;
  skuCount?: number;
  intelligenceCount?: number;
}

export function categoryAliases(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export function categorySearchText(category: ProductCategoryOption) {
  return [category.name, category.path, category.code, ...category.aliases]
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}

export function categoryLabel(category: Pick<ProductCategoryOption, "name" | "path">) {
  return category.path || category.name;
}

export function buildCategoryChildrenMap(categories: ProductCategoryOption[]) {
  const map = new Map<string | null, ProductCategoryOption[]>();
  for (const category of categories) {
    const children = map.get(category.parentId) ?? [];
    children.push(category);
    map.set(category.parentId, children);
  }
  for (const children of map.values()) {
    children.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-CN"));
  }
  return map;
}

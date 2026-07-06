import type { getInventoryLots } from "@/app/actions/inventory-lots";
import type { SkuCatalogListItem } from "@/lib/application/sku-catalog";

export interface SkuCatalogDisplayGroup {
  key: string;
  head: SkuCatalogListItem;
  variantItems: SkuCatalogListItem[];
  variantLabel: string;
  isSeries: boolean;
  isDisplayGroup: boolean;
  displayName: string;
  displayCode: string;
  displayMeta: string | null;
}

type InventoryLotRow = Awaited<ReturnType<typeof getInventoryLots>>[number];

export interface InventoryLotVariantGroup {
  skuId: string;
  skuCode: string;
  skuName: string;
  totalOnHand: number;
  lots: InventoryLotRow[];
}

export interface InventoryLotDisplayGroup {
  key: string;
  title: string;
  code: string;
  displayOnly: boolean;
  totalOnHand: number;
  totalValue: number;
  variants: InventoryLotVariantGroup[];
  lots: InventoryLotRow[];
}

function numeric(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function displayMetaForSku(item: Pick<SkuCatalogListItem, "brand" | "category" | "series">) {
  return [item.brand, item.category, item.series].filter(Boolean).join(" · ") || null;
}

function seriesFromAttributes(attributes: unknown) {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return null;
  const value = (attributes as Record<string, unknown>).series;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function familyNameFromSkuLike(item: {
  name: string;
  brand?: string | null;
  category?: string | null;
  series?: string | null;
  attributes?: unknown;
}) {
  const explicitSeries = normalizeText(item.series ?? seriesFromAttributes(item.attributes));
  if (explicitSeries) return explicitSeries;

  const name = normalizeText(item.name);
  if (!/[\u4e00-\u9fff]/.test(name)) return null;

  const parts = name.split(" ");
  if (parts.length < 3) return null;
  const family = parts.slice(0, -1).join(" ");
  return family.length >= 4 ? family : null;
}

export function familyKey(item: {
  name: string;
  brand?: string | null;
  category?: string | null;
  series?: string | null;
  attributes?: unknown;
}) {
  const family = familyNameFromSkuLike(item);
  if (!family) return null;
  return [
    normalizeText(item.brand).toLowerCase(),
    normalizeText(item.category).toLowerCase(),
    family.toLowerCase(),
  ].join("|");
}

export function buildSkuCatalogDisplayGroups(
  items: SkuCatalogListItem[]
): SkuCatalogDisplayGroup[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const childrenByParent = new Map<string, SkuCatalogListItem[]>();
  const orphanChildren: SkuCatalogListItem[] = [];
  const parentIds = new Set<string>();

  for (const item of items) {
    if (!item.parentSkuId) continue;
    if (!byId.has(item.parentSkuId)) {
      orphanChildren.push(item);
      continue;
    }
    parentIds.add(item.parentSkuId);
    const children = childrenByParent.get(item.parentSkuId) ?? [];
    children.push(item);
    childrenByParent.set(item.parentSkuId, children);
  }

  const groups: SkuCatalogDisplayGroup[] = [];
  const standaloneCandidates: SkuCatalogListItem[] = [];
  for (const item of items) {
    if (item.parentSkuId) continue;
    const children = childrenByParent.get(item.id) ?? [];
    if (children.length === 0 && !parentIds.has(item.id) && item.variantCount === 0) {
      standaloneCandidates.push(item);
      continue;
    }
    const variantItems = [...children];
    groups.push({
      key: item.id,
      head: item,
      variantItems,
      variantLabel:
        variantItems.length > 0
          ? `${variantItems.length} 个子 SKU`
          : item.variantCount > 0
            ? `${item.variantCount} 个子 SKU`
            : "独立 SKU",
      isSeries: variantItems.length > 0 || item.variantCount > 0,
      isDisplayGroup: false,
      displayName: item.name,
      displayCode: item.code,
      displayMeta: displayMetaForSku(item),
    });
  }

  const fallbackBuckets = new Map<string, SkuCatalogListItem[]>();
  const ungroupedStandalone: SkuCatalogListItem[] = [];
  for (const item of standaloneCandidates) {
    const key = familyKey(item);
    if (!key) {
      ungroupedStandalone.push(item);
      continue;
    }
    const bucket = fallbackBuckets.get(key) ?? [];
    bucket.push(item);
    fallbackBuckets.set(key, bucket);
  }

  for (const bucket of fallbackBuckets.values()) {
    if (bucket.length < 2) {
      ungroupedStandalone.push(...bucket);
      continue;
    }
    const head = bucket[0];
    const displayName = familyNameFromSkuLike(head) ?? head.name;
    groups.push({
      key: `display:${familyKey(head)}`,
      head,
      variantItems: bucket,
      variantLabel: `${bucket.length} 个 SKU`,
      isSeries: true,
      isDisplayGroup: true,
      displayName,
      displayCode: "展示分组",
      displayMeta: displayMetaForSku(head),
    });
  }

  for (const item of ungroupedStandalone) {
    groups.push({
      key: item.id,
      head: item,
      variantItems: [],
      variantLabel: "独立 SKU",
      isSeries: false,
      isDisplayGroup: false,
      displayName: item.name,
      displayCode: item.code,
      displayMeta: displayMetaForSku(item),
    });
  }

  for (const item of orphanChildren) {
    groups.push({
      key: item.id,
      head: item,
      variantItems: [],
      variantLabel: "具体规格",
      isSeries: false,
      isDisplayGroup: false,
      displayName: item.name,
      displayCode: item.code,
      displayMeta: displayMetaForSku(item),
    });
  }

  return groups.sort((a, b) => {
    if (a.isSeries !== b.isSeries) return a.isSeries ? -1 : 1;
    return a.head.name.localeCompare(b.head.name, "zh-CN");
  });
}

export function buildInventoryLotDisplayGroups(
  lots: InventoryLotRow[]
): InventoryLotDisplayGroup[] {
  const groups = new Map<string, InventoryLotDisplayGroup>();

  for (const lot of lots) {
    const parent = lot.sku.parentSku;
    const fallbackFamily = parent ? null : familyNameFromSkuLike(lot.sku);
    const fallbackKey = parent ? null : familyKey(lot.sku);
    const groupKey = parent
      ? `parent:${parent.code}`
      : fallbackKey
        ? `display:${fallbackKey}`
        : `sku:${lot.skuId}`;
    const group = groups.get(groupKey) ?? {
      key: groupKey,
      title: parent?.name ?? fallbackFamily ?? lot.sku.name,
      code: parent?.code ?? (fallbackFamily ? "展示分组" : lot.sku.code),
      displayOnly: Boolean(!parent && fallbackFamily),
      totalOnHand: 0,
      totalValue: 0,
      variants: [],
      lots: [],
    };

    const onHand = numeric(lot.onHandQuantity);
    group.totalOnHand += onHand;
    group.totalValue += numeric(lot.inventoryValue);
    group.lots.push(lot);

    let variant = group.variants.find((item) => item.skuId === lot.skuId);
    if (!variant) {
      variant = {
        skuId: lot.skuId,
        skuCode: lot.sku.code,
        skuName: lot.sku.name,
        totalOnHand: 0,
        lots: [],
      };
      group.variants.push(variant);
    }
    variant.totalOnHand += onHand;
    variant.lots.push(lot);

    groups.set(groupKey, group);
  }

  return [...groups.values()]
    .map((group) => {
      const shouldKeepDisplayGroup = !group.displayOnly || group.variants.length > 1;
      const firstVariant = group.variants[0];
      return {
        ...group,
        displayOnly: shouldKeepDisplayGroup ? group.displayOnly : false,
        title: shouldKeepDisplayGroup ? group.title : firstVariant?.skuName ?? group.title,
        code: shouldKeepDisplayGroup ? group.code : firstVariant?.skuCode ?? group.code,
        variants: group.variants,
        lots: group.lots.sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ),
      };
    })
    .sort((a, b) => b.totalOnHand - a.totalOnHand || a.title.localeCompare(b.title, "zh-CN"));
}

export const SKU_CATALOG_ROLES = ["GROUP", "VARIANT", "SIMPLE"] as const;
export type SkuCatalogRole = (typeof SKU_CATALOG_ROLES)[number];

export const SKU_IDENTITY_SOURCES = ["AUTO", "MANUAL"] as const;
export type SkuIdentitySource = (typeof SKU_IDENTITY_SOURCES)[number];

export function isSkuCatalogRole(value: unknown): value is SkuCatalogRole {
  return typeof value === "string" && SKU_CATALOG_ROLES.includes(value as SkuCatalogRole);
}

export function normalizeCatalogRole(value: unknown): SkuCatalogRole | null {
  return isSkuCatalogRole(value) ? value : null;
}

export function normalizeIdentitySourceValue(value: unknown): SkuIdentitySource {
  return value === "MANUAL" ? "MANUAL" : "AUTO";
}

export function deriveCatalogRole(input: {
  catalogRole?: string | null;
  parentSkuId?: string | null;
  childCount?: number;
}): SkuCatalogRole {
  const explicit = normalizeCatalogRole(input.catalogRole);
  if (explicit === "GROUP" || explicit === "VARIANT") return explicit;
  if (input.parentSkuId) return "VARIANT";
  if ((input.childCount ?? 0) > 0) return "GROUP";
  return explicit ?? "SIMPLE";
}

export function normalizeManufacturerCode(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ").toUpperCase() || "";
}

export function normalizeVariantLabel(input: {
  variantLabel?: string | null;
  variantValues?: Record<string, unknown> | null;
}) {
  const manual = input.variantLabel?.trim();
  if (manual) return manual;

  return Object.values(input.variantValues ?? {})
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

export function buildSkuDisplayName(input: {
  role: SkuCatalogRole;
  name?: string | null;
  parentName?: string | null;
  variantLabel?: string | null;
}) {
  if (input.role === "VARIANT") {
    const parentName = input.parentName?.trim();
    const variantLabel = input.variantLabel?.trim();
    if (parentName && variantLabel) return `${parentName} · ${variantLabel}`;
  }

  return input.name?.trim() || "";
}

function toCodeToken(value?: string | null) {
  return (
    value
      ?.trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .toUpperCase() || ""
  );
}

function variantCodeToken(value?: string | null) {
  const compact = value?.trim().replace(/\s+/g, "") || "";
  if (!compact) return "";

  const ascii = toCodeToken(compact);
  if (ascii) return ascii;

  const numeric = compact.match(/[0-9]+(?:\.[0-9]+)?/)?.[0];
  if (numeric) return numeric.replace(".", "P");

  return "";
}

function paddedSequence(sequence?: number, width = 5) {
  return String(Math.max(1, sequence ?? 1)).padStart(width, "0");
}

export function generateSkuCodeCandidate(input: {
  role: SkuCatalogRole;
  name?: string | null;
  brand?: string | null;
  manufacturerCode?: string | null;
  parentCode?: string | null;
  variantLabel?: string | null;
  sequence?: number;
}) {
  const brandToken = toCodeToken(input.brand);
  const manufacturerCode = normalizeManufacturerCode(input.manufacturerCode);

  if (input.role === "VARIANT") {
    const parentCode = input.parentCode?.trim();
    if (parentCode) {
      const token =
        variantCodeToken(input.variantLabel) || paddedSequence(input.sequence, 2);
      return `${parentCode}-${token}`;
    }
    return `SKU-${paddedSequence(input.sequence)}-${variantCodeToken(input.variantLabel) || "01"}`;
  }

  if (manufacturerCode) {
    return brandToken ? `${brandToken}-${manufacturerCode}` : manufacturerCode;
  }

  if (input.role === "GROUP") return `PG-${paddedSequence(input.sequence)}`;
  return `SKU-${paddedSequence(input.sequence)}`;
}

const INTERNAL_RETURN_BASE = "https://erp.local";

export function safeInternalReturnPath(value?: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return null;
  }

  try {
    const url = new URL(value, INTERNAL_RETURN_BASE);
    if (url.origin !== INTERNAL_RETURN_BASE || !url.pathname.startsWith("/")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function returnPathWithCreatedId(
  value: string | null | undefined,
  parameter: string,
  createdId: string
): string | null {
  const safeReturnTo = safeInternalReturnPath(value);
  if (!safeReturnTo) return null;

  const url = new URL(safeReturnTo, INTERNAL_RETURN_BASE);
  url.searchParams.set(parameter, createdId);
  return `${url.pathname}${url.search}${url.hash}`;
}

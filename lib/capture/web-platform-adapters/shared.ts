import type { WebLinkFieldClaim, WebLinkFieldName } from "@/lib/capture/web-link-types";

export function cleanWebText(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function uniqueWebText(values: Array<string | null | undefined>) {
  return [...new Set(values.map(cleanWebText).filter(Boolean))];
}

export function fieldClaim(
  fieldName: WebLinkFieldName,
  source: string,
  confidence: number,
  evidenceText?: string
): WebLinkFieldClaim {
  return {
    fieldName,
    source,
    confidence,
    ...(evidenceText ? { evidenceText: cleanWebText(evidenceText).slice(0, 500) } : {}),
  };
}

export function priceFromWebText(text: string) {
  const match = text.match(
    /(?:JP¥|JPY|¥|￥|CNY|RMB|USD|US\$|\$)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i
  );
  return match?.[1]?.replaceAll(",", "") || "";
}

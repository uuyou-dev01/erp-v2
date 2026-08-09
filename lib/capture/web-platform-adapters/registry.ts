import type { WebLinkProductFields } from "@/lib/capture/web-link-types";
import { atmosWebPlatformAdapter } from "@/lib/capture/web-platform-adapters/atmos";
import { genericWebPlatformAdapter } from "@/lib/capture/web-platform-adapters/generic";
import { goofishWebPlatformAdapter } from "@/lib/capture/web-platform-adapters/goofish";
import { mercariWebPlatformAdapter } from "@/lib/capture/web-platform-adapters/mercari";
import type {
  WebPlatformAdapterContext,
  WebPlatformContentAdapter,
  WebPlatformExtraction,
} from "@/lib/capture/web-platform-adapters/types";

const SPECIALIZED_ADAPTERS: WebPlatformContentAdapter[] = [
  mercariWebPlatformAdapter,
  atmosWebPlatformAdapter,
  goofishWebPlatformAdapter,
];

const CLEARED_FIELD_VALUES: Partial<Record<keyof WebLinkProductFields, unknown>> = {
  title: "",
  description: "",
  amount: "",
  conditionText: "",
  pageStatus: "UNKNOWN",
  sellerName: "",
  brand: "",
  sourceCategoryPath: [],
  imageUrls: [],
};

function hasMeaningfulValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0 && value !== "UNKNOWN";
  return value !== null && value !== undefined;
}

function fieldConfidence(extraction: WebPlatformExtraction, fieldName: string) {
  return extraction.claims
    .filter((claim) => claim.fieldName === fieldName)
    .reduce((highest, claim) => Math.max(highest, claim.confidence), 0);
}

export function selectWebPlatformAdapter(context: WebPlatformAdapterContext) {
  return SPECIALIZED_ADAPTERS.find((adapter) => adapter.matches(context)) ?? null;
}

export function extractWebPlatformFields(context: WebPlatformAdapterContext): {
  adapter: WebPlatformContentAdapter;
  extraction: WebPlatformExtraction;
} {
  const generic = genericWebPlatformAdapter.extract(context);
  const specializedAdapter = selectWebPlatformAdapter(context);
  if (!specializedAdapter) return { adapter: genericWebPlatformAdapter, extraction: generic };
  const specialized = specializedAdapter.extract(context);
  const fields: Partial<WebLinkProductFields> = { ...generic.fields };
  for (const fieldName of specialized.clearFields ?? []) {
    (fields as Record<string, unknown>)[fieldName] = CLEARED_FIELD_VALUES[fieldName] ?? "";
  }
  for (const [key, value] of Object.entries(specialized.fields)) {
    const genericValue = (generic.fields as Record<string, unknown>)[key];
    const explicitlyCleared = (specialized.clearFields ?? []).includes(
      key as keyof WebLinkProductFields
    );
    const shouldOverride =
      hasMeaningfulValue(value) &&
      (explicitlyCleared ||
        !hasMeaningfulValue(genericValue) ||
        fieldConfidence(specialized, key) >= fieldConfidence(generic, key));
    if (shouldOverride) {
      (fields as Record<string, unknown>)[key] = value;
    }
  }
  return {
    adapter: specializedAdapter,
    extraction: {
      fields,
      claims: [
        ...specialized.claims,
        ...generic.claims.filter(
          (claim) => !(specialized.clearFields ?? []).includes(claim.fieldName)
        ),
      ],
      warnings: specialized.warnings,
    },
  };
}

export function listWebPlatformContentAdapters() {
  return [genericWebPlatformAdapter, ...SPECIALIZED_ADAPTERS].map((adapter) => ({
    code: adapter.code,
    label: adapter.label,
    version: adapter.version,
    tier: adapter.tier,
    variants: adapter.variants,
    capabilities: adapter.capabilities,
  }));
}

import type {
  WebLinkDocument,
  WebLinkFieldClaim,
  WebLinkFieldName,
  WebLinkProductFields,
} from "@/lib/capture/web-link-types";

export type WebPlatformAdapterTier = "GENERIC" | "OPTIMIZED";

export interface WebPlatformAdapterContext {
  document: WebLinkDocument;
  normalizedUrl: string;
  platformName: string;
  externalListingId: string | null;
}

export interface WebPlatformExtraction {
  fields: Partial<WebLinkProductFields>;
  claims: WebLinkFieldClaim[];
  clearFields?: WebLinkFieldName[];
  warnings?: string[];
}

export interface WebPlatformContentAdapter {
  code: string;
  version: string;
  label: string;
  tier: WebPlatformAdapterTier;
  variants: string[];
  capabilities: string[];
  matches(context: WebPlatformAdapterContext): boolean;
  extract(context: WebPlatformAdapterContext): WebPlatformExtraction;
}

export type WebLinkExtractionMethod = "HTTP" | "BROWSER";

export type WebLinkPageStatus = "ACTIVE" | "SOLD_OUT" | "UNAVAILABLE" | "UNKNOWN";

export type WebLinkFieldName =
  | "title"
  | "description"
  | "amount"
  | "currency"
  | "conditionText"
  | "pageStatus"
  | "sellerName"
  | "brand"
  | "sourceCategoryPath"
  | "imageUrls";

export interface WebLinkFieldClaim {
  fieldName: WebLinkFieldName;
  source: string;
  confidence: number;
  evidenceText?: string;
}

export interface WebLinkDocument {
  requestedUrl: string;
  finalUrl: string;
  extractionMethod: WebLinkExtractionMethod;
  documentTitle?: string | null;
  heading?: string | null;
  articleText?: string | null;
  bodyText?: string | null;
  sharedText?: string | null;
  meta?: Record<string, string>;
  jsonLd?: unknown[];
  images?: string[];
  links?: Array<{ text: string; href: string }>;
  /** @deprecated Platform adapters should derive these from links. */
  categoryLinks?: Array<{ text: string; href: string }>;
  /** @deprecated Platform adapters should derive these from links. */
  brandLinks?: Array<{ text: string; href: string }>;
  /** @deprecated Platform adapters should derive these from links. */
  shopLinks?: Array<{ text: string; href: string }>;
}

export interface WebLinkProductFields {
  title: string;
  description: string;
  amount: string;
  currency: string;
  conditionText: string;
  pageStatus: WebLinkPageStatus;
  sellerName: string;
  brand: string;
  sourceCategoryPath: string[];
  imageUrls: string[];
}

export interface WebLinkPreview extends WebLinkProductFields {
  requestedUrl: string;
  sourceUrl: string;
  normalizedUrl: string;
  platformName: string;
  externalListingId: string | null;
  suggestedInternalCategory: string;
  extractionMethod: WebLinkExtractionMethod;
  adapterCode: string;
  adapterVersion: string;
  extractionClaims: WebLinkFieldClaim[];
  warnings: string[];
}

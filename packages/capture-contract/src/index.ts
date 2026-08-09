export type CaptureType = "SHARE_URL" | "SHARE_TEXT" | "SHARE_IMAGE" | "SCREENSHOT" | "CAMERA" | "MANUAL" | "BARCODE";
export type CaptureBusinessIntent = "OBSERVE_PRICE" | "RECORD_PURCHASE" | "UNDECIDED";
export type CaptureStatus = "RECEIVED" | "PROCESSING" | "NEEDS_REVIEW" | "READY" | "IMPORTED" | "PARTIAL" | "DUPLICATE" | "FAILED" | "DISMISSED";

export interface CaptureV1 {
  captureType: CaptureType;
  businessIntent: CaptureBusinessIntent;
  sourceUrl?: string;
  sourceText?: string;
  platformName?: string;
  externalListingId?: string;
  title?: string;
  amount?: string;
  currency?: string;
  conditionText?: string;
  visibility?: "PUBLIC" | "ORGANIZATION" | "PRIVATE";
  capturedAt?: string;
  assetIds?: string[];
}

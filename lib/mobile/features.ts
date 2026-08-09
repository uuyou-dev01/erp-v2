function enabled(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return !["0", "false", "off", "disabled"].includes(value.toLowerCase());
}

export function getMobileFeatureFlags() {
  return {
    capture: enabled("MOBILE_FEATURE_CAPTURE", true),
    webPush: enabled("MOBILE_FEATURE_WEB_PUSH", true),
    barcode: enabled("MOBILE_FEATURE_BARCODE", true),
    batchActions: enabled("MOBILE_FEATURE_BATCH_ACTIONS", true),
    continuousShipping: enabled("MOBILE_FEATURE_CONTINUOUS_SHIPPING", true),
    ocr: enabled("MOBILE_FEATURE_OCR", true),
  };
}

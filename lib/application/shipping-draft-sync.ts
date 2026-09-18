export type ShippingDraft = {
  trackingNo: string;
  shipper: string;
  shippingMethod: string;
  pickupCode: string;
  proofNote: string;
  imageUrls: string[];
};

/** Apply remote changes only to untouched fields; retain locally added images. */
export function mergeShippingDraft(
  current: ShippingDraft,
  previous: ShippingDraft,
  incoming: ShippingDraft
): ShippingDraft {
  const next = { ...current };
  for (const key of [
    "trackingNo",
    "shipper",
    "shippingMethod",
    "pickupCode",
    "proofNote",
  ] as const) {
    if (current[key] === previous[key]) next[key] = incoming[key];
  }
  const previousImages = new Set(previous.imageUrls);
  next.imageUrls = [
    ...new Set([
      ...incoming.imageUrls,
      ...current.imageUrls.filter((url) => !previousImages.has(url)),
    ]),
  ];
  return next;
}

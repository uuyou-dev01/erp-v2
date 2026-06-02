export interface ShippingProof {
  shipper?: string;
  shippingMethod?: string;
  pickupCode?: string;
  proofNote?: string;
  imageUrls?: string[];
  updatedAt?: string;
  returnTrackingNo?: string;
  returnedAt?: string;
  restockMode?: "RETURN_CHECK" | "AVAILABLE";
  cancelReason?: string;
  cancelledAt?: string;
  returnFinancials?: ReturnFinancials;
}

export interface ReturnFinancials {
  refundAmount?: string;
  platformFeeReversal?: string;
  shippingFeeReversal?: string;
  adjustedPlatformFee?: string;
  adjustedShippingFee?: string;
  adjustedNetRevenue?: string;
  recordedAt?: string;
}

export function parseShippingProof(value: unknown): ShippingProof {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    shipper: typeof record.shipper === "string" ? record.shipper : undefined,
    shippingMethod:
      typeof record.shippingMethod === "string" ? record.shippingMethod : undefined,
    pickupCode: typeof record.pickupCode === "string" ? record.pickupCode : undefined,
    proofNote: typeof record.proofNote === "string" ? record.proofNote : undefined,
    imageUrls: Array.isArray(record.imageUrls)
      ? record.imageUrls.filter((url): url is string => typeof url === "string")
      : undefined,
    returnTrackingNo:
      typeof record.returnTrackingNo === "string" ? record.returnTrackingNo : undefined,
    returnedAt: typeof record.returnedAt === "string" ? record.returnedAt : undefined,
    restockMode:
      record.restockMode === "RETURN_CHECK" || record.restockMode === "AVAILABLE"
        ? record.restockMode
        : undefined,
    cancelReason: typeof record.cancelReason === "string" ? record.cancelReason : undefined,
    cancelledAt: typeof record.cancelledAt === "string" ? record.cancelledAt : undefined,
    returnFinancials: parseReturnFinancials(record.returnFinancials),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}

function parseReturnFinancials(value: unknown): ReturnFinancials | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const pick = (key: keyof ReturnFinancials) =>
    typeof record[key] === "string" ? (record[key] as string) : undefined;
  const parsed: ReturnFinancials = {
    refundAmount: pick("refundAmount"),
    platformFeeReversal: pick("platformFeeReversal"),
    shippingFeeReversal: pick("shippingFeeReversal"),
    adjustedPlatformFee: pick("adjustedPlatformFee"),
    adjustedShippingFee: pick("adjustedShippingFee"),
    adjustedNetRevenue: pick("adjustedNetRevenue"),
    recordedAt: pick("recordedAt"),
  };
  return Object.values(parsed).some(Boolean) ? parsed : undefined;
}

export function mergeShippingProof(
  existing: ShippingProof | unknown,
  incoming: ShippingProof
): ShippingProof {
  const base = parseShippingProof(existing);
  return {
    ...base,
    ...incoming,
    imageUrls: incoming.imageUrls ?? base.imageUrls,
    updatedAt: new Date().toISOString(),
  };
}

export function shippingProofToJson(proof: ShippingProof) {
  const payload: ShippingProof = {};
  if (proof.shipper?.trim()) payload.shipper = proof.shipper.trim();
  if (proof.shippingMethod?.trim()) payload.shippingMethod = proof.shippingMethod.trim();
  if (proof.pickupCode?.trim()) payload.pickupCode = proof.pickupCode.trim();
  if (proof.proofNote?.trim()) payload.proofNote = proof.proofNote.trim();
  if (proof.imageUrls?.length) payload.imageUrls = proof.imageUrls;
  if (proof.updatedAt) payload.updatedAt = proof.updatedAt;
  if (proof.returnTrackingNo?.trim()) payload.returnTrackingNo = proof.returnTrackingNo.trim();
  if (proof.returnedAt) payload.returnedAt = proof.returnedAt;
  if (proof.restockMode) payload.restockMode = proof.restockMode;
  if (proof.cancelReason?.trim()) payload.cancelReason = proof.cancelReason.trim();
  if (proof.cancelledAt) payload.cancelledAt = proof.cancelledAt;
  if (proof.returnFinancials) payload.returnFinancials = proof.returnFinancials;
  return payload;
}

export function hasShippingProofContent(proof: ShippingProof) {
  return Boolean(
    proof.shipper ||
      proof.shippingMethod ||
      proof.pickupCode ||
      proof.proofNote ||
      (proof.imageUrls && proof.imageUrls.length > 0)
  );
}

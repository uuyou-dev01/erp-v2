import Decimal from "decimal.js";

export type BundleQuantity = string | number;

/**
 * A candidate represents one real, shared physical location. Availability and
 * destination coverage are evaluated per order line. A client can use this for an
 * early preview, but the committing server transaction must re-check live
 * reservations, inventory-pool ownership, agreements and operator permissions.
 */
export interface BundlePhysicalLocationCandidate {
  locationId: string;
  availableQuantity: BundleQuantity;
  fulfillmentMarkets: readonly string[];
}

export interface BundleFulfillmentLine {
  lineId: string;
  salesChannelAccountId: string | null;
  currency: string | null;
  quantity: BundleQuantity;
  candidatePhysicalLocations: readonly BundlePhysicalLocationCandidate[];

  /** Informational only: ownership never determines whether goods can share a parcel. */
  inventoryOwnerId?: string | null;
  /** Informational only: purchase, consignment, or resale source does not disqualify a line. */
  sourceType?: string | null;
}

export interface ResolveBundleFulfillmentEligibilityInput {
  lines: readonly BundleFulfillmentLine[];
  destinationMarket: string;
}

export const BUNDLE_FULFILLMENT_REASON_CODES = {
  MULTIPLE_LINES_REQUIRED: "MULTIPLE_LINES_REQUIRED",
  SALES_CHANNEL_ACCOUNT_REQUIRED: "SALES_CHANNEL_ACCOUNT_REQUIRED",
  SALES_CHANNEL_ACCOUNT_MISMATCH: "SALES_CHANNEL_ACCOUNT_MISMATCH",
  CURRENCY_REQUIRED: "CURRENCY_REQUIRED",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  DESTINATION_MARKET_REQUIRED: "DESTINATION_MARKET_REQUIRED",
  INVALID_QUANTITY: "INVALID_QUANTITY",
  NO_CANDIDATE_PHYSICAL_LOCATION: "NO_CANDIDATE_PHYSICAL_LOCATION",
  INSUFFICIENT_LOCATION_QUANTITY: "INSUFFICIENT_LOCATION_QUANTITY",
  DESTINATION_MARKET_UNSUPPORTED: "DESTINATION_MARKET_UNSUPPORTED",
  NO_FULFILLABLE_LOCATION_FOR_LINE: "NO_FULFILLABLE_LOCATION_FOR_LINE",
  NO_COMMON_PHYSICAL_LOCATION: "NO_COMMON_PHYSICAL_LOCATION",
} as const;

export type BundleFulfillmentReasonCode =
  (typeof BUNDLE_FULFILLMENT_REASON_CODES)[keyof typeof BUNDLE_FULFILLMENT_REASON_CODES];

export interface BundleFulfillmentReason {
  code: BundleFulfillmentReasonCode;
  message: string;
  lineIds: string[];
}

export interface BundleFulfillmentEligibilityResult {
  /** Whether the selected lines can form one sales order and one physical parcel. */
  parcelEligible: boolean;
  commonLocationIds: string[];
  reasons: BundleFulfillmentReason[];
}

interface LineLocationEvaluation {
  lineId: string;
  eligibleLocationIds: Set<string>;
  hasValidQuantity: boolean;
}

function normalizeRequiredValue(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function normalizeCurrency(value: string | null | undefined) {
  return normalizeRequiredValue(value).toUpperCase();
}

function normalizeMarket(value: string | null | undefined) {
  return normalizeRequiredValue(value).toUpperCase();
}

function positiveQuantity(value: BundleQuantity) {
  try {
    const quantity = new Decimal(value);
    return quantity.isFinite() && quantity.gt(0) ? quantity : null;
  } catch {
    return null;
  }
}

function nonNegativeQuantity(value: BundleQuantity) {
  try {
    const quantity = new Decimal(value);
    return quantity.isFinite() && quantity.gte(0) ? quantity : null;
  } catch {
    return null;
  }
}

function lineReference(line: BundleFulfillmentLine, index: number) {
  return normalizeRequiredValue(line.lineId) || `#${index + 1}`;
}

function supportsDestination(
  candidate: BundlePhysicalLocationCandidate,
  destinationMarket: string
) {
  const markets = new Set(
    candidate.fulfillmentMarkets.map((market) => normalizeMarket(market)).filter(Boolean)
  );
  return markets.has("GLOBAL") || markets.has(destinationMarket);
}

function evaluateLineLocations(
  line: BundleFulfillmentLine,
  index: number,
  destinationMarket: string,
  reasons: BundleFulfillmentReason[]
): LineLocationEvaluation {
  const lineId = lineReference(line, index);
  const requestedQuantity = positiveQuantity(line.quantity);
  if (!requestedQuantity) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.INVALID_QUANTITY,
      message: `商品 ${lineId} 的出售数量必须大于 0。`,
      lineIds: [lineId],
    });
    return { lineId, eligibleLocationIds: new Set(), hasValidQuantity: false };
  }

  const candidates = line.candidatePhysicalLocations.filter((candidate) =>
    Boolean(normalizeRequiredValue(candidate.locationId))
  );
  if (candidates.length === 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.NO_CANDIDATE_PHYSICAL_LOCATION,
      message: `商品 ${lineId} 没有可用于合包的实际库存仓位。`,
      lineIds: [lineId],
    });
    return { lineId, eligibleLocationIds: new Set(), hasValidQuantity: true };
  }

  // Destination-dependent diagnostics would be misleading until the order has
  // a destination. The top-level resolver already reports that missing input.
  if (!destinationMarket) {
    return { lineId, eligibleLocationIds: new Set(), hasValidQuantity: true };
  }

  const stockSufficient = candidates.filter((candidate) => {
    const available = nonNegativeQuantity(candidate.availableQuantity);
    return available?.gte(requestedQuantity) ?? false;
  });
  const marketCompatible = candidates.filter((candidate) =>
    supportsDestination(candidate, destinationMarket)
  );
  const eligibleLocationIds = new Set(
    stockSufficient
      .filter((candidate) => supportsDestination(candidate, destinationMarket))
      .map((candidate) => normalizeRequiredValue(candidate.locationId))
  );

  if (eligibleLocationIds.size > 0) {
    return { lineId, eligibleLocationIds, hasValidQuantity: true };
  }

  if (stockSufficient.length === 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.INSUFFICIENT_LOCATION_QUANTITY,
      message: `商品 ${lineId} 没有任何单一物理仓位具备足够的可用数量。`,
      lineIds: [lineId],
    });
  }
  if (marketCompatible.length === 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.DESTINATION_MARKET_UNSUPPORTED,
      message: `商品 ${lineId} 的候选仓位都不能履约至 ${destinationMarket} 市场。`,
      lineIds: [lineId],
    });
  }
  if (stockSufficient.length > 0 && marketCompatible.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.NO_FULFILLABLE_LOCATION_FOR_LINE,
      message: `商品 ${lineId} 的库存数量与目的市场条件无法在同一物理仓位同时满足。`,
      lineIds: [lineId],
    });
  }

  return { lineId, eligibleLocationIds, hasValidQuantity: true };
}

/**
 * Resolves whether all selected lines can be sold as one order and fulfilled as
 * one physical parcel. Ownership and source type are intentionally ignored here:
 * they affect workflow support and settlement, while the sales account and real
 * fulfillment location determine parcel eligibility. Callers must still reject a
 * source workflow that their order-line/settlement model cannot represent.
 */
export function resolveBundleFulfillmentEligibility(
  input: ResolveBundleFulfillmentEligibilityInput
): BundleFulfillmentEligibilityResult {
  const reasons: BundleFulfillmentReason[] = [];
  const lineIds = input.lines.map(lineReference);

  if (input.lines.length < 2) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.MULTIPLE_LINES_REQUIRED,
      message: "打包出售至少需要选择两件商品。",
      lineIds,
    });
  }

  const accountIds = input.lines.map((line) => normalizeRequiredValue(line.salesChannelAccountId));
  const missingAccountLineIds = lineIds.filter((_, index) => !accountIds[index]);
  if (missingAccountLineIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.SALES_CHANNEL_ACCOUNT_REQUIRED,
      message: "所有商品都必须关联明确的销售渠道账号。",
      lineIds: missingAccountLineIds,
    });
  }
  if (new Set(accountIds.filter(Boolean)).size > 1) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.SALES_CHANNEL_ACCOUNT_MISMATCH,
      message: "所选商品必须通过同一个销售渠道账号成交。",
      lineIds,
    });
  }

  const currencies = input.lines.map((line) => normalizeCurrency(line.currency));
  const missingCurrencyLineIds = lineIds.filter((_, index) => !currencies[index]);
  if (missingCurrencyLineIds.length > 0) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.CURRENCY_REQUIRED,
      message: "所有商品都必须有明确的成交币种。",
      lineIds: missingCurrencyLineIds,
    });
  }
  if (new Set(currencies.filter(Boolean)).size > 1) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.CURRENCY_MISMATCH,
      message: "所选商品的成交币种必须一致。",
      lineIds,
    });
  }

  const destinationMarket = normalizeMarket(input.destinationMarket);
  if (!destinationMarket) {
    reasons.push({
      code: BUNDLE_FULFILLMENT_REASON_CODES.DESTINATION_MARKET_REQUIRED,
      message: "必须先确定客户收货目的市场。",
      lineIds,
    });
  }

  const lineEvaluations = input.lines.map((line, index) =>
    evaluateLineLocations(line, index, destinationMarket, reasons)
  );
  const everyLineHasEligibleLocation = lineEvaluations.every(
    (evaluation) => evaluation.hasValidQuantity && evaluation.eligibleLocationIds.size > 0
  );

  let commonLocationIds: string[] = [];
  if (lineEvaluations.length > 0 && everyLineHasEligibleLocation && destinationMarket) {
    const [first, ...rest] = lineEvaluations;
    commonLocationIds = [...first.eligibleLocationIds]
      .filter((locationId) =>
        rest.every((evaluation) => evaluation.eligibleLocationIds.has(locationId))
      )
      .sort((left, right) => left.localeCompare(right));

    if (commonLocationIds.length === 0) {
      reasons.push({
        code: BUNDLE_FULFILLMENT_REASON_CODES.NO_COMMON_PHYSICAL_LOCATION,
        message: "每件商品分别可发，但没有一个共同的实际物理仓位能够合成一个包裹。",
        lineIds: lineEvaluations.map((evaluation) => evaluation.lineId),
      });
    }
  }

  return {
    parcelEligible: reasons.length === 0 && commonLocationIds.length > 0,
    commonLocationIds,
    reasons,
  };
}

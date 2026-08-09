export const LOCATION_CAPABILITIES = [
  { code: "RECEIVE", label: "收货" },
  { code: "STORE", label: "存储" },
  { code: "INSPECT", label: "质检" },
  { code: "CONSOLIDATE", label: "合箱/集运" },
  { code: "TRANSFER", label: "仓间调拨" },
  { code: "DIRECT_FULFILLMENT", label: "订单发货" },
  { code: "RETURNS", label: "退货处理" },
] as const;

export type LocationCapabilityCode = (typeof LOCATION_CAPABILITIES)[number]["code"];

export const FULFILLMENT_DESTINATIONS = [
  { code: "CN", label: "中国" },
  { code: "JP", label: "日本" },
  { code: "US", label: "美国" },
  { code: "EU", label: "欧洲" },
  { code: "GLOBAL", label: "全球" },
] as const;

export type FulfillmentDestinationCode = (typeof FULFILLMENT_DESTINATIONS)[number]["code"];

const capabilityCodes = new Set<string>(LOCATION_CAPABILITIES.map((item) => item.code));
const destinationCodes = new Set<string>(FULFILLMENT_DESTINATIONS.map((item) => item.code));

export function isLocationCapabilityCode(value: string): value is LocationCapabilityCode {
  return capabilityCodes.has(value);
}

export function isFulfillmentDestinationCode(value: string): value is FulfillmentDestinationCode {
  return destinationCodes.has(value);
}

export function capabilityLabel(code: string) {
  return LOCATION_CAPABILITIES.find((item) => item.code === code)?.label ?? code;
}

export function fulfillmentDestinationLabel(code: string) {
  return FULFILLMENT_DESTINATIONS.find((item) => item.code === code)?.label ?? code;
}

export function defaultCapabilitiesForLocationType(
  type: "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT"
): LocationCapabilityCode[] {
  if (type === "TRANSIT") return [];
  if (type === "FORWARDER") return ["RECEIVE", "STORE", "CONSOLIDATE", "TRANSFER"];
  if (type === "PERSON") return ["RECEIVE", "STORE", "TRANSFER"];
  return ["RECEIVE", "STORE", "INSPECT", "TRANSFER", "DIRECT_FULFILLMENT", "RETURNS"];
}

export function countryFromLocationRegion(region?: string | null) {
  const prefix = region?.trim().toUpperCase().split("_")[0];
  return prefix && destinationCodes.has(prefix) ? (prefix as FulfillmentDestinationCode) : null;
}

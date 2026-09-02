import {
  returnPathWithCreatedId,
  safeInternalReturnPath,
} from "@/lib/application/return-navigation";

export function safeSkuReturnPath(value?: string | null): string | null {
  return safeInternalReturnPath(value);
}

export function skuReturnPathWithCreatedId(
  value: string | null | undefined,
  createdSkuId: string
): string | null {
  return returnPathWithCreatedId(value, "createdSkuId", createdSkuId);
}

import {
  returnPathWithCreatedId,
  safeInternalReturnPath,
} from "@/lib/application/return-navigation";

export function safeLocationReturnPath(value?: string | null): string | null {
  return safeInternalReturnPath(value);
}

export function locationReturnPathWithCreatedId(
  value: string | null | undefined,
  createdLocationId: string
): string | null {
  return returnPathWithCreatedId(value, "createdLocationId", createdLocationId);
}

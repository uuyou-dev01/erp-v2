export type MobileTaskScope = "today" | "mine" | "open" | "delegated" | "completed";
export type MobileRiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface MobileApiError {
  error: {
    code: "UNAUTHORIZED" | "INVALID_REQUEST" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED";
    message: string;
  };
}

export interface ExecuteMobileActionRequest {
  expectedVersion: string;
  fields: Record<string, string | boolean | string[] | undefined>;
  confirmation?: { acceptedImpact?: boolean };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

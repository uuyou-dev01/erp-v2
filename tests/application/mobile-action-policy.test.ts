import { describe, expect, it } from "vitest";
import { getMobileActionPolicy } from "@/lib/mobile/action-policy";

describe("mobile action policy", () => {
  it("allows low-friction operational actions", () => {
    expect(getMobileActionPolicy("fillLogistics").enabled).toBe(true);
    expect(getMobileActionPolicy("confirmArrival").enabled).toBe(true);
    expect(getMobileActionPolicy("shipOrder").enabled).toBe(true);
  });

  it("keeps financial and destructive actions off mobile initially", () => {
    expect(getMobileActionPolicy("settleOrder").enabled).toBe(false);
    expect(getMobileActionPolicy("cancelOrder").enabled).toBe(false);
    expect(getMobileActionPolicy("registerReturn").enabled).toBe(true);
    expect(getMobileActionPolicy("registerReturn").riskLevel).toBe("HIGH");
    expect(getMobileActionPolicy("registerReturn").requiresSecondConfirm).toBe(true);
  });

  it("requires online execution for formal state changes", () => {
    expect(getMobileActionPolicy("inbound").requiresOnline).toBe(true);
    expect(getMobileActionPolicy("shipOrder").requiresSecondConfirm).toBe(true);
  });
});

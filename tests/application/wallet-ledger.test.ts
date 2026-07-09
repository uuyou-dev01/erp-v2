import { describe, expect, it } from "vitest";
import {
  summarizeWalletLedger,
  type WalletLedgerFact,
} from "@/lib/application/wallet-ledger";

describe("wallet ledger summary", () => {
  it("derives available, held and withdrawn balances from posted ledger facts", () => {
    const facts: WalletLedgerFact[] = [
      { entryType: "CREDIT", amount: "1000" },
      { entryType: "CREDIT", amount: "250.5" },
      { entryType: "HOLD", amount: "300" },
      { entryType: "WITHDRAWAL", amount: "200" },
      { entryType: "RELEASE", amount: "50" },
      { entryType: "ADJUSTMENT", amount: "-25.25" },
      { entryType: "CREDIT", amount: "999", status: "VOID" },
    ];

    const summary = summarizeWalletLedger(facts);

    expect(summary.availableBalance).toBe("975.25");
    expect(summary.heldBalance).toBe("50");
    expect(summary.withdrawnBalance).toBe("200");
    expect(summary.earnedBalance).toBe("1250.5");
    expect(summary.adjustmentBalance).toBe("-25.25");
  });

  it("keeps balances at zero when entries are pending or voided", () => {
    const summary = summarizeWalletLedger([
      { entryType: "CREDIT", amount: "120", status: "PENDING" },
      { entryType: "HOLD", amount: "30", status: "VOID" },
    ]);

    expect(summary.availableBalance).toBe("0");
    expect(summary.heldBalance).toBe("0");
    expect(summary.withdrawnBalance).toBe("0");
  });
});

import Decimal from "decimal.js";

export type WalletLedgerEntryType =
  | "CREDIT"
  | "DEBIT"
  | "HOLD"
  | "RELEASE"
  | "WITHDRAWAL"
  | "ADJUSTMENT";

export type WalletLedgerStatus = "POSTED" | "PENDING" | "VOID";

export interface WalletLedgerFact {
  entryType: WalletLedgerEntryType | string;
  amount: Decimal.Value;
  status?: WalletLedgerStatus | string | null;
}

export interface WalletLedgerSummary {
  availableBalance: string;
  heldBalance: string;
  withdrawnBalance: string;
  earnedBalance: string;
  adjustmentBalance: string;
}

function toDecimal(value: Decimal.Value) {
  const decimal = new Decimal(value);
  if (!decimal.isFinite()) {
    throw new Error("钱包流水金额必须是有效数字");
  }
  return decimal;
}

function serializeMoney(value: Decimal) {
  return value.toDecimalPlaces(4).toString();
}

export function summarizeWalletLedger(
  facts: WalletLedgerFact[],
): WalletLedgerSummary {
  let availableBalance = new Decimal(0);
  let heldBalance = new Decimal(0);
  let withdrawnBalance = new Decimal(0);
  let earnedBalance = new Decimal(0);
  let adjustmentBalance = new Decimal(0);

  for (const fact of facts) {
    if ((fact.status ?? "POSTED") !== "POSTED") continue;
    const amount = toDecimal(fact.amount);

    if (fact.entryType === "CREDIT") {
      availableBalance = availableBalance.plus(amount);
      earnedBalance = earnedBalance.plus(amount);
    } else if (fact.entryType === "DEBIT") {
      availableBalance = availableBalance.minus(amount);
    } else if (fact.entryType === "HOLD") {
      availableBalance = availableBalance.minus(amount);
      heldBalance = heldBalance.plus(amount);
    } else if (fact.entryType === "RELEASE") {
      availableBalance = availableBalance.plus(amount);
      heldBalance = heldBalance.minus(amount);
    } else if (fact.entryType === "WITHDRAWAL") {
      heldBalance = heldBalance.minus(amount);
      withdrawnBalance = withdrawnBalance.plus(amount);
    } else if (fact.entryType === "ADJUSTMENT") {
      availableBalance = availableBalance.plus(amount);
      adjustmentBalance = adjustmentBalance.plus(amount);
    }
  }

  return {
    availableBalance: serializeMoney(availableBalance),
    heldBalance: serializeMoney(heldBalance),
    withdrawnBalance: serializeMoney(withdrawnBalance),
    earnedBalance: serializeMoney(earnedBalance),
    adjustmentBalance: serializeMoney(adjustmentBalance),
  };
}

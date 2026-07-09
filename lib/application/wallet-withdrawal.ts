import Decimal from "decimal.js";

export interface WithdrawalHoldInput {
  availableBalance: Decimal.Value;
  amount: string;
  currency: string;
  requestedById: string;
  paymentMethod?: string;
  paymentAccount?: string;
  accountName?: string;
  note?: string;
}

export interface WithdrawalHoldPlan {
  amount: string;
  withdrawalData: {
    amount: string;
    currency: string;
    status: "REQUESTED";
    requestedById: string;
    paymentMethod: string | null;
    paymentAccount: string | null;
    accountName: string | null;
    note: string | null;
  };
  holdLedgerData: {
    entryType: "HOLD";
    amount: string;
    currency: string;
    status: "POSTED";
    sourceType: "WITHDRAWAL_REQUEST";
    description: string;
    createdById: string;
  };
}

function parseWithdrawalAmount(value: string) {
  let amount: Decimal;
  try {
    amount = new Decimal(value);
  } catch {
    throw new Error("提现金额必须是有效数字");
  }
  if (!amount.isFinite()) throw new Error("提现金额必须是有效数字");
  if (amount.lte(0)) throw new Error("提现金额必须大于 0");
  return amount;
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildWithdrawalHoldPlan(
  input: WithdrawalHoldInput,
): WithdrawalHoldPlan {
  const amount = parseWithdrawalAmount(input.amount);
  const availableBalance = new Decimal(input.availableBalance);
  if (!availableBalance.isFinite()) {
    throw new Error("可提现余额必须是有效数字");
  }
  if (amount.gt(availableBalance)) {
    throw new Error("可提现余额不足");
  }

  const serializedAmount = amount.toDecimalPlaces(4).toString();
  return {
    amount: serializedAmount,
    withdrawalData: {
      amount: serializedAmount,
      currency: input.currency,
      status: "REQUESTED",
      requestedById: input.requestedById,
      paymentMethod: cleanOptional(input.paymentMethod),
      paymentAccount: cleanOptional(input.paymentAccount),
      accountName: cleanOptional(input.accountName),
      note: cleanOptional(input.note),
    },
    holdLedgerData: {
      entryType: "HOLD",
      amount: serializedAmount,
      currency: input.currency,
      status: "POSTED",
      sourceType: "WITHDRAWAL_REQUEST",
      description: "提现申请冻结",
      createdById: input.requestedById,
    },
  };
}

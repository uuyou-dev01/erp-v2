"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestWalletWithdrawalAction } from "@/app/actions/wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function WithdrawalRequestForm({
  currency,
  availableBalance,
}: {
  currency: string;
  availableBalance: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALIPAY");
  const [paymentAccount, setPaymentAccount] = useState("");
  const [accountName, setAccountName] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submitWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const result = await requestWalletWithdrawalAction({
        currency,
        amount,
        paymentMethod,
        paymentAccount,
        accountName,
        note,
      });
      if (!result.success) {
        setMessage(result.error);
        return;
      }
      setAmount("");
      setPaymentAccount("");
      setAccountName("");
      setNote("");
      setMessage("提现申请已提交");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交提现申请失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submitWithdrawal} className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="withdrawal-amount">提现金额</Label>
        <Input
          id="withdrawal-amount"
          inputMode="decimal"
          placeholder={`可提现 ${currency} ${availableBalance}`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="withdrawal-method">收款方式</Label>
        <Input
          id="withdrawal-method"
          value={paymentMethod}
          onChange={(event) => setPaymentMethod(event.target.value.toUpperCase())}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="withdrawal-account">收款账号</Label>
        <Input
          id="withdrawal-account"
          value={paymentAccount}
          onChange={(event) => setPaymentAccount(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="withdrawal-name">收款人</Label>
        <Input
          id="withdrawal-name"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
        />
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="withdrawal-note">备注</Label>
        <Textarea
          id="withdrawal-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <Button type="submit" disabled={loading}>
          {loading ? "提交中..." : "申请提现"}
        </Button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </form>
  );
}

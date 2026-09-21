"use client";
import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { saveMobileExpense } from "@/app/actions/mobile-expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function MobileExpenseForm({
  categories,
  currency,
  draftScope,
}: {
  categories: { id: string; name: string }[];
  currency: string;
  draftScope: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const storageKey = `mobile-expense-draft:${draftScope}`;
  useEffect(() => {
    let nextKey = crypto.randomUUID();
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (saved && typeof saved.key === "string") {
        nextKey = saved.key;
        for (const name of ["description", "payee", "categoryId", "amount", "currency"]) {
          const field = formRef.current?.elements.namedItem(name) as
            | HTMLInputElement
            | HTMLSelectElement
            | null;
          if (field && typeof saved[name] === "string") field.value = saved[name];
        }
        setMessage("已恢复未提交的费用草稿");
      }
    } catch {
      /* Storage is optional; the form remains usable. */
    }
    setKey(nextKey);
  }, [storageKey]);
  return (
    <form
      ref={formRef}
      onChange={() => {
        if (!formRef.current || !key) return;
        try {
          sessionStorage.setItem(
            storageKey,
            JSON.stringify({ ...Object.fromEntries(new FormData(formRef.current)), key })
          );
        } catch {
          /* Optional local draft. */
        }
      }}
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        setMessage("");
        start(async () => {
          try {
            const result = await saveMobileExpense({
              key,
              categoryId: String(data.get("categoryId")),
              amount: String(data.get("amount")),
              currency: String(data.get("currency")),
              description: String(data.get("description")),
              payee: String(data.get("payee")),
            });
            if (!result.success) {
              setMessage(result.error);
              return;
            }
            setMessage("费用已保存为待确认记录，尚未登记付款。");
            try {
              sessionStorage.removeItem(storageKey);
            } catch {
              /* Optional local draft. */
            }
            form.reset();
            setKey(crypto.randomUUID());
            router.refresh();
          } catch {
            setMessage("保存失败，请重试");
          }
        });
      }}
    >
      <h2 className="font-semibold">零散费用</h2>
      <label className="block text-sm">
        用途
        <Input
          name="description"
          required
          placeholder="如：包材、交通、仓储"
          className="mt-1 h-11"
        />
      </label>
      <label className="block text-sm">
        收款方
        <Input name="payee" required placeholder="店铺或服务商名称" className="mt-1 h-11" />
      </label>
      <label className="block text-sm">
        分类
        <select name="categoryId" required className="mt-1 h-11 w-full rounded-lg border px-3">
          <option value="">选择费用分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[1fr_90px] gap-2">
        <label className="text-sm">
          金额
          <Input
            name="amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            className="mt-1 h-11"
          />
        </label>
        <label className="text-sm">
          币种
          <select
            name="currency"
            defaultValue={currency}
            className="mt-1 h-11 w-full rounded-lg border px-2"
          >
            {Array.from(new Set([currency, "CNY", "JPY", "USD", "HKD", "EUR"])).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        先保存费用，确认与付款沿用费用子账流程。已计入采购或销售单的邮费不要再记一次。
      </p>
      {message && (
        <p role="status" className="text-sm text-blue-700">
          {message}
        </p>
      )}
      <Button disabled={pending || !key || !categories.length} className="h-11 w-full">
        {pending ? "保存中…" : "保存费用"}
      </Button>
    </form>
  );
}

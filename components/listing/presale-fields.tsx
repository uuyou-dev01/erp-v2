"use client";

import type { PresaleInput } from "@/lib/application/presale";

export function PresaleFields({
  value,
  onChange,
}: {
  value: PresaleInput;
  onChange: (value: PresaleInput) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-sm">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={Boolean(value.isPresale)}
          onChange={(event) =>
            onChange({ isPresale: event.target.checked, buyerNoticeConfirmed: false })
          }
        />
        开启缺货预售（不设数量上限）
      </label>
      {value.isPresale ? (
        <>
          <p>当前无可售库存时仍可上架接单。缺货订单等待补货，到货分配后再发货。</p>
          <label className="block space-y-1">
            <span>预计发货日期</span>
            <input
              type="date"
              required
              value={value.expectedShipDate ?? ""}
              className="block h-9 w-full rounded-md border bg-background px-2"
              onChange={(event) =>
                onChange({
                  ...value,
                  expectedShipDate: event.target.value,
                  buyerNoticeConfirmed: false,
                })
              }
            />
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              className="mt-1"
              checked={Boolean(value.buyerNoticeConfirmed)}
              onChange={(event) =>
                onChange({ ...value, buyerNoticeConfirmed: event.target.checked })
              }
            />
            <span>
              我已在销售平台设置预售或延迟发货，并向买家明确告知预计发货日期。此处记录不会自动修改平台商品页面。
            </span>
          </label>
        </>
      ) : null}
    </fieldset>
  );
}

"use client";
import type { ShipmentConfirmationInput } from "@/lib/application/shipment-confirmation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export function ShipmentConfirmationFields({
  value,
  onChange,
}: {
  value: ShipmentConfirmationInput;
  onChange: (value: ShipmentConfirmationInput) => void;
}) {
  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">谁确认发货</legend>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="shipment-confirmation"
            checked={value.mode !== "ON_BEHALF"}
            onChange={() => onChange({ ...value, mode: "SELF" })}
          />
          我实际发货并确认
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="shipment-confirmation"
            checked={value.mode === "ON_BEHALF"}
            onChange={() => onChange({ ...value, mode: "ON_BEHALF" })}
          />
          替发货方确认
        </label>
      </div>
      {value.mode === "ON_BEHALF" && (
        <>
          <Label htmlFor="actual-shipper">实际发货人</Label>
          <Input
            id="actual-shipper"
            value={value.actualShipper ?? ""}
            maxLength={100}
            onChange={(e) => onChange({ ...value, actualShipper: e.target.value })}
            placeholder="如：日本仓 刘"
          />
          <Label htmlFor="confirmation-basis">确认依据</Label>
          <select
            id="confirmation-basis"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={value.basis ?? ""}
            onChange={(e) =>
              onChange({ ...value, basis: e.target.value as ShipmentConfirmationInput["basis"] })
            }
          >
            <option value="">请选择</option>
            <option value="WECHAT">微信告知</option>
            <option value="PHONE">电话 / 口头告知</option>
            <option value="OTHER">其他方式</option>
          </select>
          <Label htmlFor="confirmation-note">
            补充说明{value.basis === "OTHER" ? "（必填）" : "（选填）"}
          </Label>
          <Input
            id="confirmation-note"
            value={value.note ?? ""}
            maxLength={1000}
            onChange={(e) => onChange({ ...value, note: e.target.value })}
          />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        任一方确认后同步为已发货，系统自动记录确认账号和时间。
      </p>
    </fieldset>
  );
}

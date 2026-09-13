export type ShipmentConfirmationInput = {
  mode?: "SELF" | "ON_BEHALF";
  actualShipper?: string;
  basis?: "WECHAT" | "PHONE" | "OTHER";
  note?: string;
};
export type ShipmentConfirmation = {
  mode: "SELF" | "ON_BEHALF";
  actualShipper: string;
  basis: "SELF" | "WECHAT" | "PHONE" | "OTHER";
  note?: string;
  confirmedById: string;
  confirmedByName: string;
  confirmedAt: string;
};
export function buildShipmentConfirmation(
  input: ShipmentConfirmationInput | undefined,
  actor: { id: string; name: string }
): ShipmentConfirmation {
  if (input?.mode && !["SELF", "ON_BEHALF"].includes(input.mode)) throw new Error("确认方式无效");
  const note = input?.note?.trim();
  if (note && note.length > 1000) throw new Error("确认说明最多 1000 字");
  const behalf = input?.mode === "ON_BEHALF";
  const actualShipper = behalf ? input?.actualShipper?.trim() : actor.name;
  if (!actualShipper || actualShipper.length > 100)
    throw new Error("请填写实际发货人，最多 100 字");
  if (behalf && !["WECHAT", "PHONE", "OTHER"].includes(input?.basis ?? ""))
    throw new Error("请选择代确认依据");
  if (behalf && input?.basis === "OTHER" && !note) throw new Error("请说明如何得知已发货");
  return {
    mode: behalf ? "ON_BEHALF" : "SELF",
    actualShipper,
    basis: behalf ? input!.basis! : "SELF",
    note,
    confirmedById: actor.id,
    confirmedByName: actor.name,
    confirmedAt: new Date().toISOString(),
  };
}

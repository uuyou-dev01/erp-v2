"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSupplyOfferChannelPolicyAction, type SerializedSupplyOfferChannel } from "@/app/actions/supply-offers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

function channelName(channel: SerializedSupplyOfferChannel) {
  return channel.salesChannelAccount?.name ?? channel.partner?.name ?? channel.store?.name ?? "未命名渠道";
}

export function SupplyOfferChannelManager({
  channels,
  guaranteedEligible = true,
}: {
  channels: SerializedSupplyOfferChannel[];
  guaranteedEligible?: boolean;
}) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(channels.map((channel) => [channel.id, {
    inventoryMode: channel.inventoryMode,
    quotaQty: channel.quotaQty,
    expiresAt: channel.expiresAt ? new Date(channel.expiresAt).toISOString().slice(0, 16) : "",
  }])));

  const save = async (channel: SerializedSupplyOfferChannel, status = channel.status) => {
    const draft = drafts[channel.id];
    setSavingId(channel.id);
    setError(null);
    const result = await updateSupplyOfferChannelPolicyAction({
      channelId: channel.id,
      inventoryMode: draft.inventoryMode as "SHARED" | "GUARANTEED",
      quotaQty: draft.quotaQty,
      expiresAt: draft.expiresAt || undefined,
      status: status as "ACTIVE" | "PAUSED" | "REVOKED",
    });
    setSavingId(null);
    if (!result.success) return setError(result.error);
    router.refresh();
  };

  if (channels.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有绑定销售账号或代卖方，可进入编辑货盘添加。上架渠道不会自动占用库存。</p>;
  }

  return (
    <div className="space-y-3">
      {channels.map((channel) => {
        const draft = drafts[channel.id];
        return (
          <div key={channel.id} className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_180px_140px_190px_auto] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{channelName(channel)}</p>
                <Badge variant="outline">{channel.channelType === "RESELLER" ? "外部代卖" : "内部账号"}</Badge>
                {channel.status !== "ACTIVE" ? <Badge variant="secondary">{channel.status === "PAUSED" ? "已暂停" : "已撤销"}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">当前订单占用 {channel.quotaReservedQty}；共享模式下上架数量不等于库存占用。</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">库存方式</label>
              <Select value={draft.inventoryMode} onChange={(event) => setDrafts((previous) => ({ ...previous, [channel.id]: { ...draft, inventoryMode: event.target.value } }))}>
                <option value="SHARED">共享库存</option>
                <option value="GUARANTEED" disabled={!guaranteedEligible}>保证配额</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">保证数量</label>
              <Input type="number" min="0" step="1" disabled={draft.inventoryMode !== "GUARANTEED"} value={draft.quotaQty} onChange={(event) => setDrafts((previous) => ({ ...previous, [channel.id]: { ...draft, quotaQty: event.target.value } }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">配额到期</label>
              <Input type="datetime-local" disabled={draft.inventoryMode !== "GUARANTEED"} value={draft.expiresAt} onChange={(event) => setDrafts((previous) => ({ ...previous, [channel.id]: { ...draft, expiresAt: event.target.value } }))} />
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" disabled={savingId === channel.id} onClick={() => save(channel, "ACTIVE")}>{savingId === channel.id ? "保存中" : "保存"}</Button>
              <Button type="button" size="sm" variant="outline" disabled={savingId === channel.id} onClick={() => save(channel, channel.status === "PAUSED" ? "ACTIVE" : "PAUSED")}>{channel.status === "PAUSED" ? "恢复" : "暂停"}</Button>
            </div>
          </div>
        );
      })}
      {!guaranteedEligible ? <p className="text-xs text-muted-foreground">混合 SKU 或指定单品货盘使用共享库存；保证配额目前仅支持单一 SKU 的批量货盘。</p> : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

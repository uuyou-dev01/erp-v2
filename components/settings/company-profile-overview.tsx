"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CompanyProfileOverview({
  name,
  collaborationCode,
  ownerName,
  memberCount,
  storeCount,
  pendingInvitationCount,
}: {
  name: string;
  collaborationCode: string;
  ownerName: string;
  memberCount: number;
  storeCount: number;
  pendingInvitationCount: number;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="mb-8 grid gap-6 border-y py-6 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          当前企业
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          所有者 {ownerName} · {memberCount} 位成员 · {storeCount} 个店铺 · {pendingInvitationCount}{" "}
          个待处理邀请
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">
          企业协作码（只能精确查找，不能直接加入）
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold tracking-wider">
            {collaborationCode}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(collaborationCode);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "已复制" : "复制"}
          </Button>
        </div>
      </div>
    </section>
  );
}

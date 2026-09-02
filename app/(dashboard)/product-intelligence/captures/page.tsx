import Link from "next/link";
import { Camera, ChevronRight, TrendingUp } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUserContext } from "@/lib/auth/user-context";
import { Button } from "@/components/ui/button";
import { WebLinkCapture } from "@/components/product-intelligence/web-link-capture";
import { ProductWorkspaceNav } from "@/components/inventory/product-workspace-nav";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  RECEIVED: "已接收",
  PROCESSING: "识别中",
  NEEDS_REVIEW: "待整理",
  READY: "可导入",
  IMPORTED: "已导入",
  PARTIAL: "部分完成",
  DUPLICATE: "重复",
  FAILED: "失败",
  DISMISSED: "已忽略",
};

export default async function CaptureInboxPage() {
  const context = await requireUserContext();
  const captures = await prisma.productIntelligenceCapture.findMany({
    where: { organizationId: context.organizationId, storeId: context.activeStoreId },
    include: {
      assets: { select: { id: true } },
      priceChanges: {
        select: { id: true, deltaAmount: true, currency: true },
        take: 1,
        orderBy: { observedAt: "desc" },
      },
      purchaseDraft: { select: { id: true, _count: { select: { lines: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">待整理采集</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            保存外部商品链接和价格来源，再确认它属于哪个正式商品或 SKU。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" asChild>
            <Link href="/product-intelligence/price-changes">
              <TrendingUp className="mr-2 h-4 w-4" />
              价格变化
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/m/capture">手机采集</Link>
          </Button>
        </div>
      </header>
      <ProductWorkspaceNav active="captures" role={context.role} />
      <WebLinkCapture />
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">最近采集</h2>
          <span className="text-xs text-muted-foreground">{captures.length} 条</span>
        </div>
        <div className="divide-y rounded-xl border bg-card">
          {captures.length ? (
            captures.map((capture) => (
              <Link
                key={capture.id}
                href={`/product-intelligence/captures/${capture.id}`}
                className="grid grid-cols-[44px_1fr_auto] items-center gap-3 p-4 transition hover:bg-muted/30"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Camera className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {capture.title || capture.sourceText?.slice(0, 50) || "未命名采集"}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {statusLabel[capture.status] || capture.status}
                    </span>
                    {capture.priceChanges[0] ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] ${Number(capture.priceChanges[0].deltaAmount) > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}
                      >
                        价格 {Number(capture.priceChanges[0].deltaAmount) > 0 ? "+" : ""}
                        {capture.priceChanges[0].deltaAmount.toString()}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {capture.platformName || "未知来源"} ·{" "}
                    {capture.businessIntent === "RECORD_PURCHASE"
                      ? `已购买${capture.purchaseDraft ? ` · ${capture.purchaseDraft._count.lines} 件` : ""}`
                      : "价格观察"}{" "}
                    ·{" "}
                    {capture.amount
                      ? `${capture.currency} ${capture.amount.toString()}`
                      : "待补金额"}{" "}
                    · {capture.assets.length} 个附件
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))
          ) : (
            <div className="p-16 text-center text-sm text-muted-foreground">
              粘贴第一条商品链接，开始建立来源记录
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

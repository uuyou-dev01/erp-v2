import { Globe } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ListingOpsCard } from "@/components/listing/listing-ops-card";
import type { ListingOpsItem } from "@/components/listing/listing-ops-types";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ListingOpsGridProps {
  listings: ListingOpsItem[];
}

export function ListingOpsGrid({ listings }: ListingOpsGridProps) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Globe}
        title="暂无符合条件的 Listing"
        description="调整平台、状态或风险筛选后再查看。"
        actionLabel="查看可售库存"
        actionHref="/inventory/sellable?unlisted=1"
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[260px]">商品</TableHead>
            <TableHead>平台</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>平台售价</TableHead>
            <TableHead>库存</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>风险</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <ListingOpsCard key={listing.id} listing={listing} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface OverviewData {
  inventory: { totalValue: string; lotCount: number; itemCount: number };
  procurement: { totalAmount: string; orderCount: number; receivedCount: number };
  sales: { totalAmount: string; orderCount: number; confirmedCount: number };
  listing: { activeCount: number; totalCount: number };
}

interface PnLRow {
  month: string;
  revenue: number;
  platformFee: number;
  shippingFee: number;
  logisticsFee: number;
  purchaseCost: number;
  profit: number;
}

interface CsvExportButtonProps {
  overview: OverviewData;
  pnl: PnLRow[];
}

export function CsvExportButton({ overview, pnl }: CsvExportButtonProps) {
  const handleExport = () => {
    const lines: string[] = [];

    lines.push("报表类型,指标,数值");
    lines.push(`业务概览,库存总值,${overview.inventory.totalValue}`);
    lines.push(`业务概览,入库库存数,${overview.inventory.lotCount}`);
    lines.push(`业务概览,单品数,${overview.inventory.itemCount}`);
    lines.push(`业务概览,采购总额,${overview.procurement.totalAmount}`);
    lines.push(`业务概览,采购订单数,${overview.procurement.orderCount}`);
    lines.push(`业务概览,已收货订单,${overview.procurement.receivedCount}`);
    lines.push(`业务概览,销售总额,${overview.sales.totalAmount}`);
    lines.push(`业务概览,销售订单数,${overview.sales.orderCount}`);
    lines.push(`业务概览,已确认订单,${overview.sales.confirmedCount}`);
    lines.push(`业务概览,活跃上架,${overview.listing.activeCount}`);
    lines.push(`业务概览,上架总数,${overview.listing.totalCount}`);
    lines.push("");

    lines.push("月份,收入,平台费,销售履约运费,采购/转仓/集运费,采购成本,利润");
    pnl.forEach((row) => {
      lines.push(
        `${row.month},${row.revenue.toFixed(2)},${row.platformFee.toFixed(2)},${row.shippingFee.toFixed(2)},${row.logisticsFee.toFixed(2)},${row.purchaseCost.toFixed(2)},${row.profit.toFixed(2)}`,
      );
    });

    const csv = "\ufeff" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `报表-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="mr-2 h-4 w-4" />
      导出 CSV
    </Button>
  );
}

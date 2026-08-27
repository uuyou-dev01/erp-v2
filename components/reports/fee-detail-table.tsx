"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FeeDetailTableProps {
  data: {
    platformFee: string;
    shippingFee: string;
    purchaseShippingFee: string;
    transferShippingFee: string;
    consolidationShippingFee: string;
    agentFee: string;
  };
}

const FEE_ITEMS = [
  { key: "platformFee" as const, label: "平台费总计", desc: "各销售平台抽成费用" },
  { key: "shippingFee" as const, label: "销售履约运费", desc: "销售订单实际发货费用" },
  { key: "purchaseShippingFee" as const, label: "采购物流费", desc: "卖家发货至首个到货点" },
  { key: "transferShippingFee" as const, label: "转仓物流费", desc: "库存仓间转运费用" },
  { key: "consolidationShippingFee" as const, label: "集运物流费", desc: "集运批次统一发出费用" },
  { key: "agentFee" as const, label: "发货代理手续费总计", desc: "发货代理服务费用" },
];

export function FeeDetailTable({ data }: FeeDetailTableProps) {
  const total = (
    parseFloat(data.platformFee) +
    parseFloat(data.shippingFee) +
    parseFloat(data.purchaseShippingFee) +
    parseFloat(data.transferShippingFee) +
    parseFloat(data.consolidationShippingFee) +
    parseFloat(data.agentFee)
  ).toFixed(2);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>费用项目</TableHead>
          <TableHead>说明</TableHead>
          <TableHead className="text-right">金额</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FEE_ITEMS.map((item) => (
          <TableRow key={item.key}>
            <TableCell className="font-medium">{item.label}</TableCell>
            <TableCell className="text-muted-foreground">{item.desc}</TableCell>
            <TableCell className="text-right">¥{data[item.key]}</TableCell>
          </TableRow>
        ))}
        <TableRow className="border-t-2 font-semibold">
          <TableCell>费用合计</TableCell>
          <TableCell />
          <TableCell className="text-right">¥{total}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

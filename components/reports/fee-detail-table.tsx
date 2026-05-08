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
    agentFee: string;
  };
}

const FEE_ITEMS = [
  { key: "platformFee" as const, label: "平台费总计", desc: "各销售平台抽成费用" },
  { key: "shippingFee" as const, label: "运费总计", desc: "物流运输费用" },
  { key: "agentFee" as const, label: "发货代理手续费总计", desc: "发货代理服务费用" },
];

export function FeeDetailTable({ data }: FeeDetailTableProps) {
  const total = (
    parseFloat(data.platformFee) +
    parseFloat(data.shippingFee) +
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

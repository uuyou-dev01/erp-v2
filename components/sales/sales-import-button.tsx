"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { CSVImportDialog } from "@/components/shared/csv-import-dialog";
import { runImport } from "@/app/actions/import";

const TARGET_FIELDS = [
  { key: "external_order_no", label: "外部订单号" },
  { key: "platform_code", label: "平台代码", required: true },
  { key: "customer_name", label: "客户名称", required: true },
  { key: "order_date", label: "订单日期" },
  { key: "currency", label: "币种" },
  { key: "country_flow", label: "国家流向" },
];

interface SalesImportButtonProps {
  storeId: string;
}

export function SalesImportButton({ storeId }: SalesImportButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleImport = async (rows: Record<string, string>[]) => {
    const result = await runImport(storeId, "CUSTOMER_ORDER", rows);
    router.refresh();
    return result;
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        批量导入
      </Button>
      <CSVImportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="批量导入销售订单"
        targetFields={TARGET_FIELDS}
        onImport={handleImport}
      />
    </>
  );
}

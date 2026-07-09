"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { CSVImportDialog } from "@/components/shared/csv-import-dialog";
import { runImport } from "@/app/actions/import";

const STORE_ID = "store_1";

const LOT_FIELDS = [
  { key: "sku_code", label: "SKU代码", required: true },
  { key: "location_code", label: "仓库代码", required: true },
  { key: "quantity", label: "数量", required: true },
  { key: "unit_cost", label: "单位成本", required: true },
  { key: "currency", label: "币种" },
  { key: "received_at", label: "到货日期" },
];

interface LotImportButtonProps {
  label?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

export function LotImportButton({
  label = "批量导入",
  className,
  variant = "outline",
  size,
}: LotImportButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleImport = async (rows: Record<string, string>[]) => {
    const result = await runImport(STORE_ID, "INVENTORY_LOT", rows);
    router.refresh();
    return result;
  };

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </Button>
      <CSVImportDialog
        open={open}
        onClose={() => setOpen(false)}
        title="批量导入入库库存"
        targetFields={LOT_FIELDS}
        onImport={handleImport}
      />
    </>
  );
}

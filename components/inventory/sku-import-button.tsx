"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { CSVImportDialog } from "@/components/shared/csv-import-dialog";
import { runImport } from "@/app/actions/import";

const SKU_FIELDS = [
  { key: "code", label: "SKU代码", required: true },
  { key: "name", label: "商品名称", required: true },
  { key: "category", label: "分类" },
  { key: "brand", label: "品牌" },
  { key: "description", label: "描述" },
];

interface SKUImportButtonProps {
  storeId: string;
  label?: string;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}

export function SKUImportButton({
  storeId,
  label = "批量导入",
  className,
  variant = "outline",
  size,
}: SKUImportButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleImport = async (rows: Record<string, string>[]) => {
    const result = await runImport(storeId, "SKU", rows);
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
        title="批量导入SKU"
        targetFields={SKU_FIELDS}
        onImport={handleImport}
      />
    </>
  );
}

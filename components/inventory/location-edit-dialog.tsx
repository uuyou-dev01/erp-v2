"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { LocationForm } from "@/components/inventory/location-form";
import { ActionDialog } from "@/components/ui/action-dialog";
import { Button } from "@/components/ui/button";
import type { LocationType } from "@/app/actions/locations";

type LocationEditDialogProps = {
  storeId: string;
  location: {
    id: string;
    code: string;
    name: string;
    type: LocationType;
    region: string | null;
    isSellableDefault: boolean;
    capabilities: Array<{ code: string; enabled: boolean }>;
    shippingLanesFrom: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
  };
};

export function LocationEditDialog({ storeId, location }: LocationEditDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        编辑仓库
      </Button>
      <ActionDialog
        open={open}
        onOpenChange={setOpen}
        title="编辑仓库"
        description="更新仓库的基础信息、运营能力与客户配送线路。"
        placement="end"
        size="lg"
      >
        {open ? (
          <LocationForm
            storeId={storeId}
            mode="dialog"
            initialData={location}
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </ActionDialog>
    </>
  );
}

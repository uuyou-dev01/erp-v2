"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocationForm } from "@/components/inventory/location-form";

interface LocationCreateDialogProps {
  storeId: string;
  triggerText?: string;
}

export function LocationCreateDialog({
  storeId,
  triggerText = "添加位置",
}: LocationCreateDialogProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        {triggerText}
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <Card className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>新增仓库位置</CardTitle>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[calc(90vh-5rem)] overflow-y-auto">
          <LocationForm
            storeId={storeId}
            mode="dialog"
            onSuccess={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

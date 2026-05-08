"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

interface PublishableSkuDialogProps {
  items: Array<{
    skuId: string;
    skuCode: string;
    skuName: string;
    availablePlatforms: Array<{
      id: string;
      name: string;
    }>;
  }>;
}

export function PublishableSkuDialog({ items }: PublishableSkuDialogProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        可上架商品
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <Card className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>可上架商品</CardTitle>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              当前 SKU 都已覆盖全部平台，暂无新增上架候选。
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.skuId}
                className="rounded-lg border border-border/60 bg-white/60 p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">{item.skuCode}</p>
                    <p className="text-sm text-muted-foreground">{item.skuName}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.availablePlatforms.map((platform) => (
                        <Badge key={platform.id} variant="secondary">
                          可上架到 {platform.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={`/listing/new?skuId=${item.skuId}`} onClick={() => setOpen(false)}>
                      <Button size="sm">创建上架</Button>
                    </Link>
                    {item.availablePlatforms.slice(0, 2).map((platform) => (
                      <Link
                        key={platform.id}
                        href={`/listing/new?skuId=${item.skuId}&platformId=${platform.id}`}
                        onClick={() => setOpen(false)}
                      >
                        <Button size="sm" variant="outline">
                          上架到 {platform.name}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

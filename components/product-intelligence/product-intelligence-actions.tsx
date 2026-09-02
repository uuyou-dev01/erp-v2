"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Edit, Trash2 } from "lucide-react";
import { deleteProductIntelligenceItemAction } from "@/app/actions/product-intelligence";
import { Button } from "@/components/ui/button";

export function ProductIntelligenceActions({ id, isOwner }: { id: string; isOwner: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOwner) return null;

  const handleDelete = async () => {
    if (!confirm("确认删除这条市场记录？相关价格观察也会一起删除。")) return;
    setLoading(true);
    setError(null);
    const result = await deleteProductIntelligenceItemAction(id);
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    router.push("/product-intelligence");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/product-intelligence/${id}/edit`}>
        <Button variant="outline" size="sm">
          <Edit className="mr-1.5 h-4 w-4" />
          编辑
        </Button>
      </Link>
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        删除
      </Button>
      {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

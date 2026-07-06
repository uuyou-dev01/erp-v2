"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createProductIntelligenceVariantAction } from "@/app/actions/product-intelligence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function VariantForm({
  parentItemId,
  defaultVisibility,
  onCancel,
  onSuccess,
}: {
  parentItemId: string;
  defaultVisibility: string;
  onCancel?: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    visibility: defaultVisibility,
  });

  const updateForm = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const result = await createProductIntelligenceVariantAction({
      parentItemId,
      ...formData,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setFormData((prev) => ({ ...prev, title: "" }));
    router.refresh();
    onSuccess?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>规格名称</Label>
        <Input
          value={formData.title}
          onChange={(event) => updateForm({ title: event.target.value })}
          placeholder="例如：42码 / 小南 / 10cm / 黑色 S"
          autoFocus
        />
        <p className="text-xs leading-5 text-muted-foreground">
          商品组已经记录品牌、系列和货号；这里专门填写用户会选择的规格，不需要重复写完整商品名。
        </p>
      </div>
      <div className="space-y-2">
        <Label>可见范围</Label>
        <select
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={formData.visibility}
          onChange={(event) => updateForm({ visibility: event.target.value })}
        >
          <option value="PUBLIC">公开</option>
          <option value="ORGANIZATION">组织内</option>
          <option value="PRIVATE">仅自己</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" disabled={loading} onClick={onCancel}>
            取消
          </Button>
        ) : null}
        <Button type="submit" disabled={loading}>
          <Plus className="mr-1.5 h-4 w-4" />
          {loading ? "添加中..." : "添加 SKU"}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

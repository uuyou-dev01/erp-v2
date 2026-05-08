"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { convertLotToItemUnit } from "@/app/actions/inventory-lots";
import { Scissors } from "lucide-react";

const CONDITION_GRADES = [
  { value: "NEW", label: "全新" },
  { value: "LIKE_NEW", label: "准新" },
  { value: "EXCELLENT", label: "优秀" },
  { value: "GOOD", label: "良好" },
  { value: "FAIR", label: "一般" },
  { value: "POOR", label: "较差" },
  { value: "DEFECTIVE", label: "有缺陷" },
];

interface LotSplitFormProps {
  lotId: string;
  storeId: string;
  availableQty: string;
}

export function LotSplitForm({ lotId, storeId, availableQty }: LotSplitFormProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("1");
  const [conditionGrade, setConditionGrade] = useState("GOOD");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) {
        setError("请输入有效的数量");
        return;
      }
      if (qty > parseFloat(availableQty)) {
        setError(`数量不能超过可用数量 (${availableQty})`);
        return;
      }

      await convertLotToItemUnit({
        lotId,
        storeId,
        quantity: qty,
        conditionGrade,
        notes: notes || undefined,
      });

      router.refresh();
      setQuantity("1");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          标记瑕疵 · 拆出单品
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="split-qty">拆出数量</Label>
              <Input
                id="split-qty"
                type="number"
                min="1"
                step="1"
                max={availableQty}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                可用: {availableQty}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="condition-grade">成色等级</Label>
              <select
                id="condition-grade"
                value={conditionGrade}
                onChange={(e) => setConditionGrade(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CONDITION_GRADES.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="split-notes">备注</Label>
              <Textarea
                id="split-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="瑕疵描述、拆分原因..."
                rows={2}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading} variant="default">
            {loading ? "处理中..." : "确认拆出单品"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlatform } from "@/app/actions/platforms";

interface PlatformFormProps {
  storeId: string;
}

export function PlatformForm({ storeId }: PlatformFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await createPlatform({
        storeId,
        code: formData.code,
        name: formData.name,
      });

      router.push("/listing/platforms");
    } catch (error) {
      console.error("Failed to create platform:", error);
      alert("创建平台失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="code">平台代码</Label>
        <Input
          id="code"
          placeholder="例如：TAOBAO, JD, AMAZON"
          value={formData.code}
          onChange={(e) =>
            setFormData({ ...formData, code: e.target.value.toUpperCase() })
          }
          required
        />
        <p className="text-xs text-muted-foreground">
          平台的唯一标识符，建议使用大写字母
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">平台名称</Label>
        <Input
          id="name"
          placeholder="例如：淘宝、京东、亚马逊"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "创建中..." : "创建平台"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={loading}
        >
          取消
        </Button>
      </div>
    </form>
  );
}

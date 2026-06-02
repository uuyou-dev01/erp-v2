"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createLocation, updateLocation, type LocationType } from "@/app/actions/locations";
import { LOCATION_REGIONS } from "@/lib/inventory/location-regions";
import { t } from "@/lib/i18n";

interface LocationFormProps {
  storeId: string;
  mode?: "page" | "dialog";
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: {
    id: string;
    code: string;
    name: string;
    type: LocationType;
    region: string | null;
    isSellableDefault: boolean;
  };
}

function generateLocationCode(type: LocationType) {
  const prefixMap: Record<LocationType, string> = {
    WAREHOUSE: "WH",
    FORWARDER: "FW",
    PERSON: "PR",
    TRANSIT: "TR",
  };
  const suffix = String(Date.now()).slice(-4);
  return `${prefixMap[type]}-${suffix}`;
}

export function LocationForm({
  storeId,
  initialData,
  mode = "page",
  onSuccess,
  onCancel,
}: LocationFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isCreateMode = !initialData;
  const [codeEditedManually, setCodeEditedManually] = useState(false);
  const [formData, setFormData] = useState({
    code: initialData?.code || "",
    name: initialData?.name || "",
    type: (initialData?.type || "WAREHOUSE") as LocationType,
    region: initialData?.region ?? (isCreateMode ? "CN_SHANGHAI" : ""),
    isSellableDefault: initialData?.isSellableDefault ?? true,
  });

  const generatedCodeHint = useMemo(() => generateLocationCode(formData.type), [formData.type]);

  useEffect(() => {
    if (!isCreateMode || codeEditedManually) return;
    setFormData((prev) => ({ ...prev, code: generateLocationCode(prev.type) }));
  }, [formData.type, isCreateMode, codeEditedManually]);

  useEffect(() => {
    if (!isCreateMode || formData.code) return;
    setFormData((prev) => ({ ...prev, code: generateLocationCode(prev.type) }));
  }, [isCreateMode, formData.code]);

  const handleSaved = () => {
    if (mode === "dialog") {
      onSuccess?.();
      router.refresh();
      return;
    }
    router.push("/inventory/locations");
    router.refresh();
  };

  const handleCancel = () => {
    if (mode === "dialog") {
      onCancel?.();
      return;
    }
    router.back();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (initialData) {
        await updateLocation({ id: initialData.id, storeId, ...formData });
      } else {
        await createLocation({ storeId, ...formData });
      }
      handleSaved();
    } catch (error) {
      console.error("Failed to save location:", error);
      const message =
        error instanceof Error ? error.message : "保存仓库位置失败，请重试";
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const formFields = (
    <>
      <div className="space-y-2">
        <Label htmlFor="code">{t("location.code")} *</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            value={formData.code}
            onChange={(e) => {
              setCodeEditedManually(true);
              setFormData({ ...formData, code: e.target.value.toUpperCase() });
            }}
            placeholder={generatedCodeHint}
            required
          />
          {isCreateMode && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCodeEditedManually(false);
                setFormData((prev) => ({ ...prev, code: generateLocationCode(prev.type) }));
              }}
            >
              自动生成
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          推荐自动生成，可手动覆盖；系统会在保存时校验唯一性
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">{t("location.name")} *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="例如：中国主仓库"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="region">地区 *</Label>
        <Select
          id="region"
          value={formData.region}
          onChange={(e) => setFormData({ ...formData, region: e.target.value })}
          required
        >
          <option value="">选择地区</option>
          {LOCATION_REGIONS.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          标识仓库所在国家与城市，便于跨境库存与物流区分
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">{t("location.type")} *</Label>
        <Select
          id="type"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
          required
        >
          <option value="WAREHOUSE">仓库</option>
          <option value="FORWARDER">集运仓/货代</option>
          <option value="PERSON">个人（朋友/代卖）</option>
          <option value="TRANSIT">运输途中</option>
        </Select>
        <p className="text-xs text-muted-foreground">用于库存管理的位置类型</p>
      </div>

      <div className="space-y-2">
        <Checkbox
          id="isSellableDefault"
          checked={formData.isSellableDefault}
          onChange={(e) => setFormData({ ...formData, isSellableDefault: e.currentTarget.checked })}
          label="默认可销售"
        />
        <p className="text-xs text-muted-foreground">该位置的库存默认是否可用于销售</p>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={loading}>
          {loading ? t("common.saving") : initialData ? t("common.update") : t("common.create")}
        </Button>
        <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </>
  );

  if (mode === "dialog") {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {formFields}
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>{initialData ? "编辑仓库位置" : "新建仓库位置"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {formFields}
        </CardContent>
      </Card>
    </form>
  );
}

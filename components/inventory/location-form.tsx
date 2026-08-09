"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createLocationAction,
  updateLocationAction,
  type LocationType,
} from "@/app/actions/locations";
import { LOCATION_REGIONS, formatLocationRegion } from "@/lib/inventory/location-regions";
import {
  FULFILLMENT_DESTINATIONS,
  LOCATION_CAPABILITIES,
  defaultCapabilitiesForLocationType,
  fulfillmentDestinationLabel,
  type FulfillmentDestinationCode,
  type LocationCapabilityCode,
} from "@/lib/inventory/location-fulfillment";
import { t } from "@/lib/i18n";
import { AlertCircle, Info } from "lucide-react";

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
    capabilities: Array<{ code: string; enabled: boolean }>;
    shippingLanesFrom: Array<{
      laneType: string;
      destinationCountry: string | null;
      active: boolean;
    }>;
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
    capabilities: (initialData?.capabilities
      .filter((capability) => capability.enabled)
      .map((capability) => capability.code) ??
      defaultCapabilitiesForLocationType(
        initialData?.type ?? "WAREHOUSE"
      )) as LocationCapabilityCode[],
    fulfillmentMarkets: (initialData?.shippingLanesFrom
      .filter(
        (lane) => lane.active && lane.laneType === "CUSTOMER_DELIVERY" && lane.destinationCountry
      )
      .map((lane) => lane.destinationCountry) ?? ["CN"]) as FulfillmentDestinationCode[],
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const generatedCodeHint = useMemo(() => generateLocationCode(formData.type), [formData.type]);
  const canDirectFulfill = formData.capabilities.includes("DIRECT_FULFILLMENT");

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

  const updateFormData = (updates: Partial<typeof formData>) => {
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const toggleCapability = (code: LocationCapabilityCode, checked: boolean) => {
    const capabilities = checked
      ? [...new Set([...formData.capabilities, code])]
      : formData.capabilities.filter((value) => value !== code);
    updateFormData({
      capabilities,
      ...(!checked && code === "DIRECT_FULFILLMENT" ? { fulfillmentMarkets: [] } : {}),
    });
  };

  const toggleFulfillmentMarket = (code: FulfillmentDestinationCode, checked: boolean) => {
    const fulfillmentMarkets = checked
      ? [...new Set([...formData.fulfillmentMarkets, code])]
      : formData.fulfillmentMarkets.filter((value) => value !== code);
    updateFormData({
      fulfillmentMarkets,
      ...(checked && !canDirectFulfill
        ? { capabilities: [...formData.capabilities, "DIRECT_FULFILLMENT"] }
        : {}),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setLoading(true);

    try {
      const result = initialData
        ? await updateLocationAction({ id: initialData.id, storeId, ...formData })
        : await createLocationAction({ storeId, ...formData });

      if (!result.success) {
        setSubmitError(result.error);
        return;
      }
      handleSaved();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "保存仓库位置失败，请重试");
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
              updateFormData({ code: e.target.value.toUpperCase() });
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
                updateFormData({ code: generateLocationCode(formData.type) });
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
          onChange={(e) => updateFormData({ name: e.target.value })}
          placeholder="例如：中国主仓库"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="region">实际所在地区 *</Label>
        <Select
          id="region"
          value={formData.region}
          onChange={(e) => updateFormData({ region: e.target.value })}
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
          只表示库存的物理位置，不再限制商品可以服务哪个销售市场。
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">{t("location.type")} *</Label>
        <Select
          id="type"
          value={formData.type}
          onChange={(e) => {
            const type = e.target.value as LocationType;
            updateFormData({
              type,
              ...(isCreateMode
                ? {
                    capabilities: defaultCapabilitiesForLocationType(type),
                    fulfillmentMarkets: type === "WAREHOUSE" ? formData.fulfillmentMarkets : [],
                    isSellableDefault: type !== "TRANSIT",
                  }
                : {}),
            });
          }}
          required
        >
          <option value="WAREHOUSE">仓库</option>
          <option value="FORWARDER">集运仓/货代</option>
          <option value="PERSON">个人（朋友/代卖）</option>
          <option value="TRANSIT">运输途中</option>
        </Select>
        <p className="text-xs text-muted-foreground">
          运营分类，用于区分自有仓、货代/集运、个人持有人或运输节点。
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <Label>节点运营能力</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            位置类型用于归类，实际能执行的动作由这里决定。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCATION_CAPABILITIES.map((capability) => (
            <Checkbox
              key={capability.code}
              id={`capability-${capability.code}`}
              checked={formData.capabilities.includes(capability.code)}
              onChange={(event) => toggleCapability(capability.code, event.currentTarget.checked)}
              label={capability.label}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <div>
          <Label>客户配送线路</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            选择该节点可以直接履约的订单目的地；可同时支持本地发货和跨境直发。
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {FULFILLMENT_DESTINATIONS.map((destination) => (
            <Checkbox
              key={destination.code}
              id={`destination-${destination.code}`}
              checked={formData.fulfillmentMarkets.includes(destination.code)}
              disabled={!canDirectFulfill}
              onChange={(event) =>
                toggleFulfillmentMarket(destination.code, event.currentTarget.checked)
              }
              label={`可发往${destination.label}`}
            />
          ))}
        </div>
        {!canDirectFulfill ? (
          <p className="text-xs text-amber-700">开启“订单发货”能力后才能配置客户配送线路。</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Checkbox
          id="isSellableDefault"
          checked={formData.isSellableDefault}
          onChange={(e) => updateFormData({ isSellableDefault: e.currentTarget.checked })}
          label="库存到达后可分配"
        />
        <p className="text-xs text-muted-foreground">
          开启后库存进入可分配层；关闭后作为在途、隔离或暂存库存。是否能向客户发货由上面的能力与线路决定。
        </p>
      </div>

      <div className="flex gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          当前配置预览：位于 {formatLocationRegion(formData.region)} ·{" "}
          {formData.isSellableDefault ? "库存可分配" : "库存仅作在途/暂存"}
          {canDirectFulfill
            ? ` · 可履约：${
                formData.fulfillmentMarkets.length > 0
                  ? formData.fulfillmentMarkets.map(fulfillmentDestinationLabel).join("、")
                  : "尚未配置目的地"
              }`
            : " · 不直接向客户发货"}
        </p>
      </div>

      {submitError ? (
        <div
          role="alert"
          className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{submitError}</p>
        </div>
      ) : null}

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
        <CardContent className="space-y-4">{formFields}</CardContent>
      </Card>
    </form>
  );
}

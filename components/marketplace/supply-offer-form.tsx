"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  changeSupplyOfferStatusAction,
  createSupplyOfferAction,
  updateSupplyOfferAction,
  type SerializedSupplyOffer,
  type SupplyOfferFormContext,
  type SupplyOfferInventoryOption,
  type SupplyOfferItemInput,
} from "@/app/actions/supply-offers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductImage } from "@/components/ui/product-image";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  Package,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";

type PartnerOption = {
  id: string;
  name: string;
  type?: string;
  defaultCurrency: string | null;
};

type InitialOffer = Pick<
  SerializedSupplyOffer,
  | "id"
  | "title"
  | "description"
  | "ownerPartnerId"
  | "visibility"
  | "inventoryPolicy"
  | "safetyStockQty"
  | "unitPrice"
  | "currency"
  | "settlementCurrency"
  | "commissionType"
  | "commissionRate"
  | "commissionFixedAmount"
  | "dropshipFee"
  | "dropshipFeeCurrency"
  | "agreementTerms"
  | "agreementRule"
  | "fulfillmentMode"
  | "providerOrganizationId"
  | "shipFromLocation"
  | "etaDays"
  | "minOrderQty"
  | "maxOrderQty"
  | "status"
  | "items"
  | "visibilityRules"
  | "salesChannels"
>;

const RECOMMENDED_MARKUP = 0.2;
const PROFIT_DEDUCTION_OPTIONS = [
  { value: "SUPPLY_COST", label: "供货成本" },
  { value: "PLATFORM_FEE", label: "平台手续费" },
  { value: "FULFILLMENT_FEE", label: "打包发货服务费" },
  { value: "SHIPPING_FEE", label: "本单运费" },
] as const;

function initialProfitDeductions(rule: unknown) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    return PROFIT_DEDUCTION_OPTIONS.map((option) => option.value);
  }
  const value = (rule as { profitDeductions?: unknown }).profitDeductions;
  if (!Array.isArray(value)) return PROFIT_DEDUCTION_OPTIONS.map((option) => option.value);
  return value.filter(
    (candidate): candidate is (typeof PROFIT_DEDUCTION_OPTIONS)[number]["value"] =>
      PROFIT_DEDUCTION_OPTIONS.some((option) => option.value === candidate)
  );
}

function emptyManualItem(currency: string): SupplyOfferItemInput {
  return { title: "", variantCode: "", quantityAvailable: "1", unitPrice: "", currency, notes: "" };
}

function suggestedSupplyPrice(unitCost: string | null | undefined) {
  const cost = Number(unitCost);
  if (!unitCost || !Number.isFinite(cost) || cost < 0) return "";
  return (Math.ceil(cost * (1 + RECOMMENDED_MARKUP) * 100) / 100).toFixed(2);
}

function optionToItem(
  option: SupplyOfferInventoryOption,
  fallbackCurrency: string
): SupplyOfferItemInput {
  return {
    skuId: option.sourceType === "SKU" ? option.skuId : undefined,
    itemUnitId: option.itemUnitId,
    title: option.title,
    variantCode:
      option.sourceType === "ITEM_UNIT" ? option.conditionGrade || option.skuCode : option.skuCode,
    quantityAvailable: option.sourceType === "ITEM_UNIT" ? "1" : option.sellableQty,
    unitPrice: suggestedSupplyPrice(option.unitCost),
    currency: option.costCurrency || fallbackCurrency,
    notes: "",
  };
}

function itemKey(item: SupplyOfferItemInput) {
  if (item.itemUnitId) return `ITEM_UNIT:${item.itemUnitId}`;
  if (item.skuId) return `SKU:${item.skuId}`;
  return item.id ? `MANUAL:${item.id}` : null;
}

function money(currency: string, value: number | string) {
  const amount = Number(value);
  return `${currency || ""} ${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`.trim();
}

function resolvedOfferTitle(items: SupplyOfferItemInput[], customTitle: string) {
  if (customTitle.trim()) return customTitle.trim();
  const firstTitle = items[0]?.title.trim();
  if (!firstTitle) return "未命名货盘";
  return items.length === 1 ? firstTitle : `${firstTitle} 等 ${items.length} 个商品`;
}

export function SupplyOfferForm({
  storeId,
  partners,
  formContext,
  initialData,
}: {
  storeId: string;
  partners: PartnerOption[];
  formContext: SupplyOfferFormContext;
  initialData?: InitialOffer;
}) {
  const router = useRouter();
  const initialHasInventory = Boolean(
    initialData?.items.some((item) => item.skuId || item.itemUnitId)
  );
  const [sourceMode, setSourceMode] = useState<"OWN_INVENTORY" | "EXTERNAL_SUPPLY">(
    initialData && !initialHasInventory ? "EXTERNAL_SUPPLY" : "OWN_INVENTORY"
  );
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: initialData?.title ?? "",
    description: initialData?.description ?? "",
    ownerPartnerId: initialData?.ownerPartnerId ?? "",
    visibility: initialData?.visibility ?? "PRIVATE",
    inventoryPolicy: "SHARED_POOL",
    safetyStockQty: initialData?.safetyStockQty ?? "0",
    unitPrice: initialData?.unitPrice ?? "",
    currency: initialData?.currency ?? formContext.inventoryPools[0]?.baseCurrency ?? "JPY",
    settlementCurrency:
      initialData?.settlementCurrency ??
      initialData?.currency ??
      formContext.inventoryPools[0]?.baseCurrency ??
      "JPY",
    commissionType: initialData?.commissionType ?? "MARGIN",
    commissionRate: initialData?.commissionRate ?? "",
    commissionFixedAmount: initialData?.commissionFixedAmount ?? "",
    dropshipFee: initialData?.dropshipFee ?? "",
    dropshipFeeCurrency:
      initialData?.dropshipFeeCurrency ??
      initialData?.settlementCurrency ??
      initialData?.currency ??
      "JPY",
    agreementTerms: initialData?.agreementTerms ?? "",
    profitDeductions: initialProfitDeductions(initialData?.agreementRule),
    fulfillmentMode: initialData?.fulfillmentMode ?? "SUPPLIER_SHIPS",
    providerOrganizationId: initialData?.providerOrganizationId ?? formContext.organization.id,
    shipFromLocation: initialData?.shipFromLocation ?? "",
    etaDays: initialData?.etaDays?.toString() ?? "2",
    minOrderQty: initialData?.minOrderQty ?? "1",
    maxOrderQty: initialData?.maxOrderQty ?? "",
  });
  const [items, setItems] = useState<SupplyOfferItemInput[]>(
    initialData?.items.length
      ? initialData.items.map((item) => ({
          id: item.id,
          skuId: item.skuId ?? undefined,
          itemUnitId: item.itemUnitId ?? undefined,
          title: item.title,
          variantCode: item.variantCode ?? "",
          quantityAvailable: item.quantityAvailable,
          unitPrice: item.unitPrice ?? "",
          currency: item.currency ?? initialData.currency ?? "JPY",
          notes: item.notes ?? "",
        }))
      : []
  );
  const [viewerStoreIds] = useState<string[]>(
    initialData?.visibilityRules
      .map((rule) => rule.viewerStoreId)
      .filter((id): id is string => Boolean(id)) ?? []
  );
  const [viewerPartnerIds, setViewerPartnerIds] = useState<string[]>(
    initialData?.visibilityRules
      .map((rule) => rule.partnerId)
      .filter((id): id is string => Boolean(id)) ?? []
  );
  const [salesChannelAccountIds] = useState<string[]>(
    initialData?.salesChannels
      .map((channel) => channel.salesChannelAccountId)
      .filter((id): id is string => Boolean(id)) ?? []
  );
  const [resellerPartnerIds] = useState<string[]>(
    initialData?.salesChannels
      .map((channel) => channel.partnerId)
      .filter((id): id is string => Boolean(id)) ?? []
  );

  const selectedKeys = useMemo(() => new Set(items.map(itemKey).filter(Boolean)), [items]);
  const selectedSkuIds = useMemo(
    () => new Set(items.map((item) => item.skuId).filter(Boolean)),
    [items]
  );
  const optionByKey = useMemo(
    () => new Map(formContext.inventoryOptions.map((option) => [option.key, option])),
    [formContext.inventoryOptions]
  );
  const visibleInventory = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return formContext.inventoryOptions.filter(
      (option) =>
        !normalized ||
        `${option.title} ${option.skuCode} ${option.conditionGrade ?? ""} ${option.locationLabel}`
          .toLowerCase()
          .includes(normalized)
    );
  }, [formContext.inventoryOptions, query]);

  const totalQty = items.reduce((sum, item) => sum + (Number(item.quantityAvailable) || 0), 0);
  const unpricedCount = items.filter((item) => !item.unitPrice && !formData.unitPrice).length;
  const estimatedMargins = items.reduce((totals, item) => {
    const option = optionByKey.get(itemKey(item) || "");
    const price = Number(item.unitPrice || formData.unitPrice);
    if (option?.unitCost == null || !option.costCurrency) return totals;
    const cost = Number(option.unitCost);
    const currency = item.currency || formData.currency;
    if (option.costCurrency !== currency || !Number.isFinite(price) || !Number.isFinite(cost))
      return totals;
    totals.set(
      currency,
      (totals.get(currency) ?? 0) + (price - cost) * (Number(item.quantityAvailable) || 0)
    );
    return totals;
  }, new Map<string, number>());

  const updateField = (updates: Partial<typeof formData>) => {
    setError(null);
    setFormData((previous) => ({ ...previous, ...updates }));
  };

  const toggleId = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    id: string,
    checked: boolean
  ) => {
    setError(null);
    setter((previous) =>
      checked ? [...new Set([...previous, id])] : previous.filter((value) => value !== id)
    );
  };

  const toggleInventory = (option: SupplyOfferInventoryOption) => {
    setError(null);
    if (selectedKeys.has(option.key)) {
      setItems((previous) => previous.filter((item) => itemKey(item) !== option.key));
      return;
    }
    if (option.sourceType === "ITEM_UNIT" && selectedSkuIds.has(option.skuId)) {
      setError("该商品已按 SKU 选择，不能再重复选择其中的具体单件");
      return;
    }
    if (
      option.sourceType === "SKU" &&
      items.some(
        (item) =>
          item.itemUnitId &&
          formContext.inventoryOptions.find((candidate) => candidate.itemUnitId === item.itemUnitId)
            ?.skuId === option.skuId
      )
    ) {
      setError("该商品已有具体单件被选择，不能再重复选择整个 SKU");
      return;
    }
    setItems((previous) => [...previous, optionToItem(option, formData.currency)]);
  };

  const updateItem = (index: number, updates: Partial<SupplyOfferItemInput>) => {
    setError(null);
    setItems((previous) =>
      previous.map((item, itemIndex) => (itemIndex === index ? { ...item, ...updates } : item))
    );
  };

  const applySuggestedPrices = () => {
    setError(null);
    setItems((previous) =>
      previous.map((item) => {
        const option = optionByKey.get(itemKey(item) || "");
        const suggested = suggestedSupplyPrice(option?.unitCost);
        if (!suggested) return item;
        return {
          ...item,
          unitPrice: suggested,
          currency: option?.costCurrency || item.currency || formData.currency,
        };
      })
    );
  };

  const validate = () => {
    if (items.length === 0) return "请至少选择一个库存商品或添加一条外部供给明细";
    if (sourceMode === "EXTERNAL_SUPPLY" && !formData.ownerPartnerId)
      return "外部供给需要选择供给方";
    if (items.some((item) => !item.title.trim() || Number(item.quantityAvailable) <= 0)) {
      return "请补全商品名称和有效发布数量";
    }
    if (items.some((item) => Number(item.unitPrice || formData.unitPrice) <= 0)) {
      return "请为每个商品填写有效供货价";
    }
    if (!formData.currency.trim()) return "请填写货盘币种";
    if (
      ["PERCENT", "HYBRID", "PROFIT_PERCENT"].includes(formData.commissionType) &&
      !formData.commissionRate
    ) {
      return "请填写佣金比例";
    }
    if (["FIXED", "HYBRID"].includes(formData.commissionType) && !formData.commissionFixedAmount) {
      return "请填写固定佣金";
    }
    if (
      formData.fulfillmentMode === "THIRD_PARTY_SHIPS" &&
      formData.providerOrganizationId === formContext.organization.id
    ) {
      return "第三方代发需要选择一个已签约的代发服务商";
    }
    return null;
  };

  const save = async (publishAfterSave: boolean) => {
    const message = validate();
    if (message) return setError(message);
    setError(null);
    setLoading(true);
    try {
      const payload = {
        storeId,
        ...formData,
        title: resolvedOfferTitle(items, formData.title),
        ownerPartnerId: formData.ownerPartnerId || undefined,
        description: formData.description || undefined,
        unitPrice: formData.unitPrice || undefined,
        currency: formData.currency || undefined,
        settlementCurrency: formData.settlementCurrency || formData.currency || undefined,
        commissionRate: formData.commissionRate || undefined,
        commissionFixedAmount: formData.commissionFixedAmount || undefined,
        dropshipFee: formData.dropshipFee || undefined,
        dropshipFeeCurrency: formData.dropshipFeeCurrency || undefined,
        agreementTerms: formData.agreementTerms || undefined,
        shipFromLocation: formData.shipFromLocation || undefined,
        etaDays: formData.etaDays || undefined,
        minOrderQty: formData.minOrderQty || undefined,
        maxOrderQty: formData.maxOrderQty || undefined,
        viewerStoreIds: formData.visibility === "PARTNER_ONLY" ? viewerStoreIds : [],
        viewerPartnerIds: formData.visibility === "PARTNER_ONLY" ? viewerPartnerIds : [],
        salesChannelAccountIds,
        resellerPartnerIds,
        items: items.map((item) => ({
          ...item,
          currency: item.currency || formData.currency || undefined,
          unitPrice: item.unitPrice || formData.unitPrice || undefined,
        })),
      };
      const result = initialData
        ? await updateSupplyOfferAction(initialData.id, payload)
        : await createSupplyOfferAction(payload);
      if (!result.success) return setError(result.error);
      if (publishAfterSave) {
        const publishResult = await changeSupplyOfferStatusAction(result.id, "PUBLISHED");
        if (!publishResult.success) {
          setError(`草稿已保存，但发布失败：${publishResult.error}`);
          return;
        }
      }
      router.push(`/marketplace/my-offers/${result.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存货盘失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{formContext.organization.name}</Badge>
              <Badge variant="secondary">代卖方赚取差价</Badge>
            </div>
            <h2 className="mt-3 text-xl font-semibold">选择商品并确定供货价</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              系统会根据内部库存成本提供供货价参考。代卖方只能看到供货结算价，不会看到你的采购成本。
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm lg:max-w-sm">
            <p className="font-medium">发布不占用库存</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              多个账号和代卖方可以同时上架；订单成交后才锁定真实库存。
            </p>
          </div>
        </div>
        <div className="grid border-t bg-muted/20 sm:grid-cols-3">
          <PublishSummary label="库存方式" value="共享实际库存" note="成交后锁库" />
          <PublishSummary label="默认发货" value="由供货方发货" note="订单产生后自动选仓" />
          <PublishSummary
            label="发布结果"
            value={`${items.length} 个商品 · ${totalQty} 件`}
            note={unpricedCount ? `${unpricedCount} 项待定价` : "价格已完整"}
          />
        </div>
      </section>

      {sourceMode === "OWN_INVENTORY" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
          <section className="overflow-hidden rounded-xl border bg-background">
            <div className="border-b p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">从库存选择</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    标准商品可按数量发布；一物一单的商品可以指定具体那一件。
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSourceMode("EXTERNAL_SUPPLY");
                    setItems((current) =>
                      current.filter((item) => !item.skuId && !item.itemUnitId)
                    );
                  }}
                >
                  外部货源
                </Button>
              </div>
              <div className="relative mt-4">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索商品、货号"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="max-h-[590px] space-y-2 overflow-y-auto p-3">
              {visibleInventory.map((option) => {
                const selected = selectedKeys.has(option.key);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => toggleInventory(option)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    }`}
                  >
                    <ProductImage src={option.imageUrl} alt={option.title} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{option.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {option.skuCode}
                        {option.sourceType === "ITEM_UNIT"
                          ? ` · ${formatItemUnitCondition(option.conditionGrade)}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        可售 {option.sellableQty}
                        {option.unitCost && option.costCurrency
                          ? ` · 成本 ${money(option.costCurrency, option.unitCost)}`
                          : " · 暂无成本参考"}
                      </p>
                    </div>
                    <Checkbox aria-label={`选择 ${option.title}`} checked={selected} readOnly />
                  </button>
                );
              })}
              {visibleInventory.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  没有匹配的可售库存
                </div>
              ) : null}
            </div>
          </section>

          <SelectedOfferItems
            items={items}
            options={formContext.inventoryOptions}
            fallbackCurrency={formData.currency}
            estimatedMargins={estimatedMargins}
            onUpdate={updateItem}
            onRemove={(index) =>
              setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
            }
            onApplySuggested={applySuggestedPrices}
          />
        </div>
      ) : (
        <section className="space-y-5 rounded-xl border bg-background p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">发布外部货源</h3>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                外部货源没有系统内库存保证，成交时需要供给方确认。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSourceMode("OWN_INVENTORY");
                setItems((current) => current.filter((item) => item.skuId || item.itemUnitId));
              }}
            >
              <Boxes className="h-4 w-4" />
              返回库存选品
            </Button>
          </div>
          <div className="max-w-xl space-y-2">
            <Label>外部供给方 *</Label>
            <Select
              value={formData.ownerPartnerId}
              onChange={(event) => updateField({ ownerPartnerId: event.target.value })}
            >
              <option value="">请选择供给方</option>
              {partners.map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-3">
            {items.map((item, index) => (
              <ManualItemRow
                key={item.id ?? index}
                item={item}
                onUpdate={(updates) => updateItem(index, updates)}
                onRemove={() =>
                  setItems((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
                }
              />
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setItems((previous) => [...previous, emptyManualItem(formData.currency)])
            }
          >
            添加外部货源明细
          </Button>
        </section>
      )}

      <section className="space-y-6 rounded-xl border bg-background p-5">
        <div>
          <h3 className="text-lg font-semibold">发布给谁、谁发货、怎么分钱</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            这是发布前需要确认的三件事。销售平台和账号由代卖方自己选择，不需要货主在这里逐个平台勾选。
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">谁可以卖</p>
              <p className="text-xs text-muted-foreground">货盘属于当前经营主体，与仓库无关。</p>
            </div>
            <Select
              value={formData.visibility}
              onChange={(event) => updateField({ visibility: event.target.value })}
            >
              <option value="PRIVATE">只在自己团队内使用</option>
              <option value="PARTNER_ONLY">只给指定朋友 / 公司</option>
              <option value="PUBLIC">市场里的合作方都能看到</option>
            </Select>
            {formData.visibility === "PARTNER_ONLY" ? (
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md bg-muted/30 p-2">
                {partners.length ? (
                  partners.map((partner) => (
                    <Checkbox
                      key={partner.id}
                      id={`core-viewer-partner-${partner.id}`}
                      label={partner.name}
                      checked={viewerPartnerIds.includes(partner.id)}
                      onChange={(event) =>
                        toggleId(setViewerPartnerIds, partner.id, event.target.checked)
                      }
                    />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    请先建立合作方并关联对方经营主体代码。
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">卖出后谁发货</p>
              <p className="text-xs text-muted-foreground">成交时才按收货国家和可配送仓库锁货。</p>
            </div>
            <Select
              value={formData.fulfillmentMode}
              onChange={(event) => {
                const fulfillmentMode = event.target.value;
                const firstExternalProvider = formContext.fulfillmentProviders.find(
                  (provider) => provider.id !== formContext.organization.id
                );
                updateField({
                  fulfillmentMode,
                  providerOrganizationId:
                    fulfillmentMode === "THIRD_PARTY_SHIPS"
                      ? (firstExternalProvider?.id ?? "")
                      : formContext.organization.id,
                });
              }}
            >
              <option value="SUPPLIER_SHIPS">我方负责发货</option>
              <option value="THIRD_PARTY_SHIPS">指定服务方帮忙发货</option>
              <option value="RESELLER_SHIPS">代卖方拿货后自己发</option>
              <option value="CONTACT_ONLY">成交后再商量</option>
            </Select>
            {formData.fulfillmentMode === "THIRD_PARTY_SHIPS" ? (
              <>
                <Select
                  value={formData.providerOrganizationId}
                  onChange={(event) => updateField({ providerOrganizationId: event.target.value })}
                >
                  <option value="">请选择已签约服务方</option>
                  {formContext.fulfillmentProviders
                    .filter((provider) => provider.id !== formContext.organization.id)
                    .map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                </Select>
                <div className="grid grid-cols-[1fr_90px] gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.dropshipFee}
                    onChange={(event) => updateField({ dropshipFee: event.target.value })}
                    placeholder="每件发货费"
                  />
                  <Input
                    value={formData.dropshipFeeCurrency}
                    onChange={(event) =>
                      updateField({ dropshipFeeCurrency: event.target.value.toUpperCase() })
                    }
                    placeholder="币种"
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">双方怎么约定分钱</p>
              <p className="text-xs text-muted-foreground">
                正文是依据；系统建议只负责试算，不能替双方做决定。
              </p>
            </div>
            <Textarea
              rows={5}
              value={formData.agreementTerms}
              onChange={(event) => updateField({ agreementTerms: event.target.value })}
              placeholder="用双方都听得懂的话写清：货主至少收多少、哪些费用谁承担、代卖方怎么拿钱、汇率按哪一天。"
            />
            <details className="rounded-md bg-muted/30 p-3">
              <summary className="cursor-pointer text-xs font-medium">
                让系统按一个模板试算（可选）
              </summary>
              <div className="mt-3 space-y-2">
                <Select
                  value={formData.commissionType}
                  onChange={(event) => updateField({ commissionType: event.target.value })}
                >
                  <option value="MARGIN">货主收供货价，对方保留差价</option>
                  <option value="PERCENT">按成交额比例试算</option>
                  <option value="FIXED">按每件固定金额试算</option>
                  <option value="HYBRID">固定金额 + 成交额比例</option>
                  <option value="PROFIT_PERCENT">按约定费用扣除后的利润试算</option>
                  <option value="MANUAL">成交后双方人工确认</option>
                </Select>
                {["PERCENT", "HYBRID", "PROFIT_PERCENT"].includes(formData.commissionType) ? (
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={formData.commissionRate}
                    onChange={(event) => updateField({ commissionRate: event.target.value })}
                    placeholder="比例，例如 0.2"
                  />
                ) : null}
                {["FIXED", "HYBRID"].includes(formData.commissionType) ? (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.commissionFixedAmount}
                    onChange={(event) => updateField({ commissionFixedAmount: event.target.value })}
                    placeholder="每件固定金额"
                  />
                ) : null}
                {formData.commissionType === "PROFIT_PERCENT" ? (
                  <div className="space-y-2 rounded-md border bg-background p-3">
                    <p className="text-xs font-medium">
                      双方约定：哪些费用先扣除，再计算可分金额？
                    </p>
                    <p className="text-xs text-muted-foreground">
                      以下只是系统建议，可按本次协议逐项调整；全部不选表示直接按成交额试算。
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {PROFIT_DEDUCTION_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={formData.profitDeductions.includes(option.value)}
                            onChange={(event) =>
                              updateField({
                                profitDeductions: event.target.checked
                                  ? [...new Set([...formData.profitDeductions, option.value])]
                                  : formData.profitDeductions.filter(
                                      (value) => value !== option.value
                                    ),
                              })
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </section>

      <details className="group overflow-hidden rounded-xl border bg-background">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
          <div className="flex items-start gap-3">
            <SlidersHorizontal className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">更多限制与备注（可选）</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                货盘名称、安全库存、起订量、预计时效和通常从哪里发货
              </p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-8 border-t p-5">
          <section className="space-y-4">
            <div>
              <h4 className="font-medium">货盘信息</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                名称留空时，系统会根据所选商品自动生成。
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="offer-title">货盘名称（可选）</Label>
                <Input
                  id="offer-title"
                  value={formData.title}
                  onChange={(event) => updateField({ title: event.target.value })}
                  placeholder={resolvedOfferTitle(items, "")}
                />
              </div>
              <div className="space-y-2">
                <Label>结算币种</Label>
                <Input
                  value={formData.settlementCurrency}
                  onChange={(event) =>
                    updateField({ settlementCurrency: event.target.value.toUpperCase() })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>货盘说明（可选）</Label>
              <Textarea
                value={formData.description}
                onChange={(event) => updateField({ description: event.target.value })}
                rows={4}
                placeholder="补充商品成色、销售限制或结算说明"
              />
            </div>
          </section>

          <section className="space-y-4 border-t pt-7">
            <div>
              <h4 className="font-medium">库存与订单限制</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                默认不预占库存，发布数量仅作为可接单上限。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>安全库存</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.safetyStockQty}
                  onChange={(event) => updateField({ safetyStockQty: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>最小起订量</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.minOrderQty}
                  onChange={(event) => updateField({ minOrderQty: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>单笔最大数量</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.maxOrderQty}
                  onChange={(event) => updateField({ maxOrderQty: event.target.value })}
                  placeholder="留空表示不限"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-7">
            <h4 className="font-medium">预计时效与指定发货点</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>预计几天内发货</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.etaDays}
                  onChange={(event) => updateField({ etaDays: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>通常从哪里发货（可选）</Label>
                <Input
                  value={formData.shipFromLocation}
                  onChange={(event) => updateField({ shipFromLocation: event.target.value })}
                  placeholder="留空则按收货国家自动选择可配送仓库"
                />
              </div>
            </div>
          </section>
        </div>
      </details>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-background/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          <ArrowLeft className="h-4 w-4" />
          取消
        </Button>
        <div className="flex items-center justify-end gap-2">
          <div className="mr-2 hidden text-right text-xs text-muted-foreground lg:block">
            <p>{unpricedCount ? `${unpricedCount} 个商品尚未定价` : "所有商品已完成定价"}</p>
            <p>发布后仍可修改高级规则</p>
          </div>
          <Button type="button" variant="outline" disabled={loading} onClick={() => save(false)}>
            {loading ? "保存中..." : "保存草稿"}
          </Button>
          <Button type="button" disabled={loading || items.length === 0} onClick={() => save(true)}>
            {loading
              ? "发布中..."
              : initialData?.status === "PUBLISHED"
                ? "保存并保持发布"
                : "确认发布"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PublishSummary({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-b px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function SelectedOfferItems({
  items,
  options,
  fallbackCurrency,
  estimatedMargins,
  onUpdate,
  onRemove,
  onApplySuggested,
}: {
  items: SupplyOfferItemInput[];
  options: SupplyOfferInventoryOption[];
  fallbackCurrency: string;
  estimatedMargins: Map<string, number>;
  onUpdate: (index: number, updates: Partial<SupplyOfferItemInput>) => void;
  onRemove: (index: number) => void;
  onApplySuggested: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-background">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">供货商品与价格</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            建议价按当前库存成本加 20% 计算，仅作为快速定价参考。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onApplySuggested}
          disabled={items.length === 0}
        >
          全部使用建议价
        </Button>
      </div>

      {items.length ? (
        <div className="divide-y">
          {items.map((item, index) => {
            const option = options.find((candidate) => candidate.key === itemKey(item));
            const currency = item.currency || option?.costCurrency || fallbackCurrency;
            const recommendation = suggestedSupplyPrice(option?.unitCost);
            const price = Number(item.unitPrice);
            const hasCost = option?.unitCost != null && Boolean(option.costCurrency);
            const cost = hasCost ? Number(option.unitCost) : Number.NaN;
            const sameCurrency = !option?.costCurrency || option.costCurrency === currency;
            const margin =
              hasCost && sameCurrency && Number.isFinite(price) && Number.isFinite(cost)
                ? price - cost
                : null;

            return (
              <article key={itemKey(item) ?? index} className="p-4">
                <div className="flex items-start gap-3">
                  <ProductImage src={option?.imageUrl} alt={item.title} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <Badge variant="outline">
                        {item.itemUnitId ? "一物一单" : "标准商品 · 共享库存"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.variantCode || option?.skuCode} · 成交后从共享库存自动选择出库仓
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`移除 ${item.title}`}
                    onClick={() => onRemove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[0.75fr_1fr_1fr_1.1fr_0.9fr]">
                  <div className="space-y-1.5">
                    <Label className="text-xs">发布数量</Label>
                    <Input
                      type="number"
                      min="1"
                      max={option?.sellableQty}
                      step="1"
                      value={item.quantityAvailable}
                      onChange={(event) =>
                        onUpdate(index, { quantityAvailable: event.target.value })
                      }
                      disabled={Boolean(item.itemUnitId)}
                    />
                  </div>
                  <PriceFact
                    label="内部成本"
                    value={
                      option?.unitCost && option.costCurrency
                        ? money(option.costCurrency, option.unitCost)
                        : "暂无成本"
                    }
                    muted={!option?.unitCost}
                  />
                  <PriceFact
                    label="建议供货价"
                    value={
                      recommendation
                        ? money(option?.costCurrency || currency, recommendation)
                        : "手动定价"
                    }
                    emphasized={Boolean(recommendation)}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs">实际供货价 *</Label>
                    <div className="flex">
                      <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-2.5 text-xs text-muted-foreground">
                        {currency}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitPrice || ""}
                        onChange={(event) =>
                          onUpdate(index, { unitPrice: event.target.value, currency })
                        }
                        placeholder="输入价格"
                        className="rounded-l-none"
                      />
                    </div>
                  </div>
                  <PriceFact
                    label="预计单件毛利"
                    value={margin === null ? "待计算" : money(currency, margin)}
                    emphasized={margin !== null && margin >= 0}
                    warning={margin !== null && margin < 0}
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
          <Boxes className="h-8 w-8 text-muted-foreground/50" />
          <p className="mt-4 text-sm font-medium">先从左侧选择要发布的商品</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            选择后系统会自动带出成本参考和建议供货价，你可以逐项调整。
          </p>
        </div>
      )}

      {items.length ? (
        <div className="flex flex-col gap-2 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="text-muted-foreground">成本仅供内部定价参考，不会展示给代卖方。</span>
          <span className="font-medium">
            {estimatedMargins.size
              ? `预计本批毛利 ${[...estimatedMargins.entries()]
                  .map(([currency, amount]) => money(currency, amount))
                  .join(" / ")}`
              : "补充成本后可计算预计毛利"}
          </span>
        </div>
      ) : null}
    </section>
  );
}

function PriceFact({
  label,
  value,
  muted = false,
  emphasized = false,
  warning = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasized?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 truncate text-sm font-medium ${
          warning
            ? "text-red-600"
            : emphasized
              ? "text-emerald-700"
              : muted
                ? "text-muted-foreground"
                : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ManualItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: SupplyOfferItemInput;
  onUpdate: (updates: Partial<SupplyOfferItemInput>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1.4fr_0.8fr_0.6fr_0.8fr_auto]">
      <Input
        value={item.title}
        onChange={(event) => onUpdate({ title: event.target.value })}
        placeholder="商品名称"
      />
      <Input
        value={item.variantCode || ""}
        onChange={(event) => onUpdate({ variantCode: event.target.value })}
        placeholder="规格/货号"
      />
      <Input
        type="number"
        min="1"
        step="1"
        value={item.quantityAvailable}
        onChange={(event) => onUpdate({ quantityAvailable: event.target.value })}
      />
      <Input
        type="number"
        min="0"
        step="0.01"
        value={item.unitPrice || ""}
        onChange={(event) => onUpdate({ unitPrice: event.target.value })}
        placeholder="供货价"
      />
      <Button type="button" variant="ghost" size="icon" aria-label="删除明细" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

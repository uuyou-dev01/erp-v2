import { requireUserContext } from "@/lib/auth/user-context";
import Link from "next/link";
import { getItemUnits } from "@/app/actions/item-units";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/decimal";
import { Plus, Package, CheckCircle, Clock, XCircle } from "lucide-react";
import { ResponsiveTable, Column } from "@/components/shared/responsive-table";
import { EntityId } from "@/components/shared/entity-id";
import { ItemUnitRowActions } from "@/components/inventory/item-unit-row-actions";
import { canViewInventoryCost, hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { formatItemUnitCondition } from "@/lib/inventory/item-unit-display";
import {
  itemConditionTypeLabel,
  itemFunctionStatusLabel,
  normalizeItemConditionType,
} from "@/lib/inventory/item-condition";
import { InventoryDetailsShell } from "@/components/inventory/inventory-details-shell";

export const dynamic = "force-dynamic";

const statusColors = {
  AVAILABLE: "default",
  ALLOCATED: "secondary",
  CONSUMED: "outline",
  RETURN_CHECK: "secondary",
  RETURN_TO_SUPPLIER: "destructive",
} as const;

const labelStatusLabels: Record<string, string> = {
  PENDING: "待贴标",
  PRINTED: "已打印",
  ATTACHED: "已贴标",
};

type ItemRow = Awaited<ReturnType<typeof getItemUnits>>[number];

export default async function ItemUnitsPage() {
  const context = await requireUserContext();
  const storeId = context.activeStoreId;
  const showCost = canViewInventoryCost(context.role);
  const canManage = hasRoleAtLeast(context.role, ROLES.MANAGER);
  const items = await getItemUnits(storeId);

  const stats = {
    pendingLabel: items.filter((i) => i.labelStatus !== "ATTACHED").length,
    pendingPhoto: items.filter((i) => i.photoCount === 0).length,
    sellable: items.filter((i) => i.status === "AVAILABLE" && i.location.isSellableDefault).length,
    activeListingUnits: items.filter((i) => i.activeListingCount > 0).length,
    activeListings: items.reduce((sum, i) => sum + i.activeListingCount, 0),
  };

  const columns: Column<ItemRow>[] = [
    {
      key: "unit",
      header: "单件库存",
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-medium">{row.unitCode || <EntityId id={row.id} />}</p>
          <p className="text-xs text-muted-foreground">标签：{row.labelCode || "未生成"}</p>
        </div>
      ),
    },
    {
      key: "sku",
      header: "SKU 层级",
      cell: (row) =>
        row.sku.parentSku ? (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              {row.sku.parentSku.code} · {row.sku.parentSku.name}
            </p>
            <p className="font-medium">
              {row.sku.code} · {row.sku.name}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="font-medium">
              {row.sku.code} · {row.sku.name}
            </p>
            <p className="text-xs text-muted-foreground">独立 SKU</p>
          </div>
        ),
    },
    {
      key: "label",
      header: "标签",
      cell: (row) => (
        <div className="space-y-1">
          <Badge variant={row.labelStatus === "ATTACHED" ? "default" : "secondary"}>
            {labelStatusLabels[row.labelStatus] || row.labelStatus}
          </Badge>
          {row.labelPrintedAt ? (
            <p className="text-xs text-muted-foreground">
              {new Date(row.labelPrintedAt).toLocaleDateString("zh-CN")}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "photos",
      header: "图片",
      cell: (row) =>
        row.photoCount > 0 ? (
          <span>{row.photoCount} 张</span>
        ) : (
          <Badge variant="secondary">待补图</Badge>
        ),
    },
    {
      key: "location",
      header: "库位",
      cell: (row) => (
        <div className="space-y-1">
          <p>{row.location.code}</p>
          <p className="text-xs text-muted-foreground">
            {row.operationalState.physicalLabel} · {row.operationalState.availabilityLabel}
          </p>
        </div>
      ),
    },
    {
      key: "conditionStatus",
      header: "状态",
      cell: (row) => (
        <div className="space-y-1">
          <Badge variant={statusColors[row.status as keyof typeof statusColors]}>
            {row.operationalState.statusLabel}
          </Badge>
          <p className="text-xs text-muted-foreground">
            {itemConditionTypeLabel(row.conditionType)}
            {normalizeItemConditionType(row.conditionType) === "USED"
              ? ` · ${formatItemUnitCondition(row.conditionGrade)}`
              : ""}
            {` · 功能${itemFunctionStatusLabel(row.functionStatus)}`}
          </p>
          {row.operationalState.workflowReason !== "NONE" ? (
            <p className="max-w-xs text-xs text-muted-foreground">
              {row.operationalState.explanation}
            </p>
          ) : null}
        </div>
      ),
    },
    ...(showCost
      ? [
          {
            key: "cost",
            header: "成本",
            cell: (row: ItemRow) =>
              row.unitCost && row.costCurrency
                ? formatCurrency(row.unitCost, row.costCurrency)
                : "—",
          } satisfies Column<ItemRow>,
        ]
      : []),
    {
      key: "listings",
      header: "上架",
      hideOnMobile: true,
      cell: (row) =>
        row.activeListingCount > 0 ? (
          <span>{row.activeListingCount} 条</span>
        ) : (
          <span className="text-muted-foreground">未上架</span>
        ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: "操作",
            className: "text-right",
            cell: (row) => (
              <ItemUnitRowActions id={row.id} skuCode={row.sku.code} storeId={storeId} />
            ),
          } satisfies Column<ItemRow>,
        ]
      : [
          {
            key: "actions",
            header: "操作",
            className: "text-right",
            cell: (row: ItemRow) => (
              <Link href={`/inventory/items/${row.id}`}>
                <Button variant="ghost" size="sm">
                  查看
                </Button>
              </Link>
            ),
          } satisfies Column<ItemRow>,
        ]),
  ];

  return (
    <InventoryDetailsShell
      activeTab="items"
      role={context.role}
      actions={
        canManage ? (
          <Link href="/inventory/items/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              添加单件库存
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待贴标</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingLabel}</div>
            <p className="text-xs text-muted-foreground">未贴标单件库存</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">待补图</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingPhoto}</div>
            <p className="text-xs text-muted-foreground">缺少图片单件库存</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可售单件</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sellable}</div>
            <p className="text-xs text-muted-foreground">状态可用且库位可售</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">上架中</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeListingUnits}</div>
            <p className="text-xs text-muted-foreground">{stats.activeListings} 条有效上架</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>单件库存工作台</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={columns}
            data={items}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无单件库存</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  添加第一件库存后开始核对标签、图片和上架状态。
                </p>
                {canManage ? (
                  <Link href="/inventory/items/new">
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      添加单件库存
                    </Button>
                  </Link>
                ) : null}
              </div>
            }
          />
        </CardContent>
      </Card>
    </InventoryDetailsShell>
  );
}

import { requireUserContext } from "@/lib/auth/user-context";
import { getPlatforms } from "@/app/actions/platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ResponsiveTable, type Column } from "@/components/shared/responsive-table";
import { Plus, Globe } from "lucide-react";
import Link from "next/link";
import { COUNTRIES, CURRENCIES } from "@/lib/i18n";
import { PlatformRowActions } from "@/components/listing/platform-row-actions";

export const dynamic = "force-dynamic";


type PlatformRow = Awaited<ReturnType<typeof getPlatforms>>[number];

const countryMap = Object.fromEntries(COUNTRIES.map((c) => [c.value, c.label]));
const currencyMap = Object.fromEntries(CURRENCIES.map((c) => [c.value, c.label]));

function formatRate(value: unknown): string {
  if (value == null) return "-";
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function getColumns(storeId: string): Column<PlatformRow>[] {
  return [
  {
    key: "code",
    header: "平台代码",
    cell: (row) => <span className="font-medium font-mono">{row.code}</span>,
  },
  {
    key: "name",
    header: "平台名称",
    cell: (row) => (
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span>{row.name}</span>
      </div>
    ),
  },
  {
    key: "country",
    header: "国家",
    cell: (row) => (
      <span>{row.country ? countryMap[row.country] || row.country : "-"}</span>
    ),
  },
  {
    key: "feeRate",
    header: "平台费率",
    cell: (row) => <span>{formatRate(row.defaultFeeRate)}</span>,
  },
  {
    key: "defaultShippingFee",
    header: "默认邮费",
    cell: (row) => (
      <span>
        {row.defaultShippingFee
          ? `${row.defaultCurrency || ""} ${row.defaultShippingFee}`.trim()
          : "-"}
      </span>
    ),
    hideOnMobile: true,
  },
  {
    key: "shippingRules",
    header: "配送规则",
    cell: (row) => {
      const rules = Array.isArray(row.shippingRules) ? row.shippingRules : [];
      return <span>{rules.length > 0 ? `${rules.length} 条规则` : "-"}</span>;
    },
    hideOnMobile: true,
  },
  {
    key: "currency",
    header: "币种",
    cell: (row) => (
      <span>
        {row.defaultCurrency
          ? currencyMap[row.defaultCurrency] || row.defaultCurrency
          : "-"}
      </span>
    ),
    hideOnMobile: true,
  },
  {
    key: "createdAt",
    header: "创建时间",
    cell: (row) => new Date(row.createdAt).toLocaleDateString("zh-CN"),
    hideOnMobile: true,
  },
  {
    key: "actions",
    header: "操作",
    className: "text-right",
    cell: (row) => (
      <PlatformRowActions id={row.id} name={row.name} storeId={storeId} />
    ),
  },
  ];
}

export default async function PlatformsPage() {
  const { activeStoreId: storeId } = await requireUserContext();
  const platforms = await getPlatforms(storeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">销售平台</h1>
          <p className="text-muted-foreground">管理商品销售的电商平台</p>
        </div>
        <Link href="/listing/platforms/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            添加平台
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>平台列表</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveTable
            columns={getColumns(storeId)}
            data={platforms}
            keyExtractor={(row) => row.id}
            emptyState={
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">暂无平台</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  添加第一个销售平台开始多平台管理
                </p>
                <Link href="/listing/platforms/new">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    添加平台
                  </Button>
                </Link>
              </div>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

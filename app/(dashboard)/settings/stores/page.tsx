import { getStoreSettingsData } from "@/app/actions/store-settings";
import { StoreManagementPanel } from "@/components/team/store-management-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StoreSettingsPage() {
  let data: Awaited<ReturnType<typeof getStoreSettingsData>>;
  try {
    data = await getStoreSettingsData();
  } catch (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">店铺管理</h1>
          <p className="text-muted-foreground">管理经营主体下的店铺、默认币种和店铺访问基础信息。</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>暂时无法加载店铺</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "请确认当前用户和店铺数据已初始化。"}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">店铺管理</h1>
        <p className="text-muted-foreground">管理经营主体下的店铺、默认币种和店铺访问基础信息。</p>
      </div>
      <StoreManagementPanel stores={data.stores} currentStoreId={data.currentStoreId} />
    </div>
  );
}

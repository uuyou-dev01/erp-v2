import { MapPin, SlidersHorizontal, Store, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsLinkList } from "@/components/settings/settings-link-list";

export default function SystemSettingsPage() {
  return (
    <div>
      <PageHeader
        title="系统设置"
        description="维护 ERP 运行时共用的基础资料与业务规则。"
        badge={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </span>
        }
      />
      <SettingsLinkList
        items={[
          {
            title: "商品分类",
            description: "管理标准品类和企业自定义分类。",
            href: "/settings/categories",
            icon: Tags,
          },
          {
            title: "销售平台",
            description: "配置上架渠道、平台费率和默认币种。",
            href: "/listing/platforms",
            icon: Store,
          },
          {
            title: "仓库位置",
            description: "维护仓库、集运节点和可销售位置。",
            href: "/inventory/locations",
            icon: MapPin,
          },
        ]}
      />
    </div>
  );
}

import { Boxes, Building2, Handshake, Store, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsLinkList } from "@/components/settings/settings-link-list";

export default function CompanySettingsPage() {
  return (
    <div>
      <PageHeader
        title="企业设置"
        description="管理组织、成员、店铺与外部合作关系。"
        badge={
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" />
          </span>
        }
      />
      <SettingsLinkList
        items={[
          {
            title: "团队成员",
            description: "管理成员账号、角色以及店铺访问权限。",
            href: "/settings/team",
            icon: Users,
          },
          {
            title: "店铺管理",
            description: "维护经营店铺、默认币种和平台账号。",
            href: "/settings/stores",
            icon: Store,
          },
          {
            title: "业务归属与协作",
            description: "管理货盘、销售店铺、仓库运营方及跨主体服务协议。",
            href: "/settings/business-structure",
            icon: Boxes,
          },
          {
            title: "合作方",
            description: "维护供货方、代卖方、代发方和结算关系。",
            href: "/settings/partners",
            icon: Handshake,
          },
        ]}
      />
    </div>
  );
}

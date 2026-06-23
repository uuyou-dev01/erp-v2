import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Box, Globe, MapPin, Package, PackageOpen } from "lucide-react";
import Link from "next/link";

export default function InventoryPage() {
  const modules = [
    {
      title: "仓库位置",
      description: "维护仓库、货代仓、可售默认仓和库位区域",
      icon: MapPin,
      href: "/inventory/locations",
      color: "text-blue-500",
    },
    {
      title: "SKU 档案",
      description: "维护标准商品、变体、图片和基础定价信息",
      icon: Box,
      href: "/inventory/skus",
      color: "text-green-500",
    },
    {
      title: "入库批次",
      description: "查看采购入库后的批次数量、成本和所在仓位",
      icon: Package,
      href: "/inventory/lots",
      color: "text-purple-500",
    },
    {
      title: "单件库存",
      description: "核对中古、瑕疵、唯一件等单件库存的标签、图片和上架状态",
      icon: PackageOpen,
      href: "/inventory/items",
      color: "text-orange-500",
    },
    {
      title: "销售平台",
      description: "配置平台、费率、默认币种和上架展示信息",
      icon: Globe,
      href: "/listing/platforms",
      color: "text-cyan-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">库存与基础资料</h1>
        <p className="text-muted-foreground">
          集中维护 SKU、单件库存、入库批次、仓库位置和销售平台。
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.title} className="hover:border-primary transition-colors">
            <CardHeader>
              <div className="flex items-center gap-3">
                <module.icon className={`h-8 w-8 ${module.color}`} />
                <CardTitle>{module.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">{module.description}</p>
              <Link href={module.href}>
                <Button variant="outline" className="w-full">
                  打开{module.title}
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>页面定位</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            这里作为基础资料入口保留；日常处理可售库存、盘点和上架状态时，
            优先从侧边栏的「库存运营」进入。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

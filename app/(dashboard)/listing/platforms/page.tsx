import { getPlatforms } from "@/app/actions/platforms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Globe, Search } from "lucide-react";
import Link from "next/link";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default async function PlatformsPage() {
  const platforms = await getPlatforms(STORE_ID);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">销售平台</h1>
          <p className="text-muted-foreground">
            管理商品销售的电商平台
          </p>
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
          <div className="flex items-center justify-between">
            <CardTitle>平台列表</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索平台..." className="pl-8 w-[200px]" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {platforms.length === 0 ? (
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>平台代码</TableHead>
                  <TableHead>平台名称</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {platforms.map((platform) => (
                  <TableRow key={platform.id}>
                    <TableCell className="font-medium font-mono">
                      {platform.code}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span>{platform.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(platform.createdAt).toLocaleDateString("zh-CN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/listing/platforms/${platform.id}`}>
                        <Button variant="ghost" size="sm">
                          查看
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

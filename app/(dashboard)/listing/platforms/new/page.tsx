import { requireUserContext } from "@/lib/auth/user-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformForm } from "@/components/listing/platform-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { safeInternalReturnPath } from "@/lib/application/return-navigation";

export const dynamic = "force-dynamic";

export default async function NewPlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { activeStoreId: storeId } = await requireUserContext();
  const { returnTo } = await searchParams;
  const safeReturnTo = safeInternalReturnPath(returnTo);
  const backHref = safeReturnTo ?? "/listing/platforms";
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={backHref}>
          <Button variant="ghost" size="icon" aria-label="返回来源页面">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">添加销售平台</h1>
          <p className="text-muted-foreground">配置新的电商销售平台</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>平台信息</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformForm storeId={storeId} returnTo={safeReturnTo} />
        </CardContent>
      </Card>
    </div>
  );
}

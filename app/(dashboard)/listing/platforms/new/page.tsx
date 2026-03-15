import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformForm } from "@/components/listing/platform-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default function NewPlatformPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/listing/platforms">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">添加销售平台</h1>
          <p className="text-muted-foreground">
            配置新的电商销售平台
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>平台信息</CardTitle>
        </CardHeader>
        <CardContent>
          <PlatformForm storeId={STORE_ID} />
        </CardContent>
      </Card>
    </div>
  );
}

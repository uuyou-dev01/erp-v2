import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListingForm } from "@/components/listing/listing-form";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Temporary hardcoded storeId
const STORE_ID = "store_1";

export default function NewListingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/listing">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">新建上架</h1>
          <p className="text-muted-foreground">
            将商品上架到销售平台
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>上架信息</CardTitle>
        </CardHeader>
        <CardContent>
          <ListingForm storeId={STORE_ID} />
        </CardContent>
      </Card>
    </div>
  );
}

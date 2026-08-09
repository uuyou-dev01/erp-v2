import { requireUserContext } from "@/lib/auth/user-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemUnitForm } from "@/components/inventory/item-unit-form";
import { BackButton } from "@/components/shared/back-button";
import { hasRoleAtLeast, ROLES } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NewItemUnitPage() {
  const context = await requireUserContext();
  if (!hasRoleAtLeast(context.role, ROLES.MANAGER)) redirect("/inventory/items");
  const storeId = context.activeStoreId;
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <BackButton label="" fallbackHref="/inventory/items" className="mt-0.5 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold">录入单件商品</h1>
          <p className="text-muted-foreground">
            为中古、瑕疵品或其他需要逐件管理的商品建立独立身份。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>单件信息</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemUnitForm storeId={storeId} mode="create" />
        </CardContent>
      </Card>
    </div>
  );
}

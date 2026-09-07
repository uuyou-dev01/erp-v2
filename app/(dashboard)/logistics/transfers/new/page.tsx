import { TransferShipmentForm } from "@/components/logistics/transfer-shipment-form";
import { PageHeader } from "@/components/ui/page-header";
import {
  getTransferLocations,
  listTransferInventoryCandidates,
} from "@/app/actions/transfer-shipments";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewTransferShipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ fromLocationId?: string; purchaseOrderId?: string }>;
}) {
  const context = await requireUserContext();
  const params = await searchParams;
  const [locations, candidates, store] = await Promise.all([
    getTransferLocations(context.activeStoreId),
    listTransferInventoryCandidates({ storeId: context.activeStoreId }),
    prisma.store.findUniqueOrThrow({
      where: { id: context.activeStoreId },
      select: { currency: true },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="新建转运包裹"
        description="从任意库存位置选取部分商品或混合多个采购来源，发出方与收货方分别确认。"
      />
      <TransferShipmentForm
        storeId={context.activeStoreId}
        locations={locations}
        candidates={candidates}
        initialFromLocationId={params.fromLocationId}
        focusPurchaseOrderId={params.purchaseOrderId}
        defaultCurrency={store.currency}
      />
    </div>
  );
}

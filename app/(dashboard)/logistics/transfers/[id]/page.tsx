import { notFound } from "next/navigation";
import { getTransferLocations, getTransferShipmentById } from "@/app/actions/transfer-shipments";
import { TransferShipmentDetail } from "@/components/logistics/transfer-shipment-detail";

export const dynamic = "force-dynamic";

export default async function TransferShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shipment = await getTransferShipmentById(id);
  if (!shipment) notFound();
  const locations = await getTransferLocations(shipment.storeId);
  return <TransferShipmentDetail shipment={shipment} locations={locations} />;
}

import { getLocationById } from "@/app/actions/locations";
import { LocationForm } from "@/components/inventory/location-form";
import { notFound } from "next/navigation";

// Force dynamic rendering
export const dynamic = "force-dynamic";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const location = await getLocationById(id);

  if (!location) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Edit Location</h1>
        <p className="text-muted-foreground">Update location details</p>
      </div>

      <LocationForm
        storeId={STORE_ID}
        initialData={{
          id: location.id,
          code: location.code,
          name: location.name,
          type: location.type as "WAREHOUSE" | "FORWARDER" | "PERSON" | "TRANSIT",
          isSellableDefault: location.isSellableDefault,
        }}
      />
    </div>
  );
}

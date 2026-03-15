import { LocationForm } from "@/components/inventory/location-form";

// Temporary hardcoded storeId - will be replaced with auth context
const STORE_ID = "store_1";

export default function NewLocationPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">New Location</h1>
        <p className="text-muted-foreground">
          Add a new warehouse, forwarder, or storage location
        </p>
      </div>

      <LocationForm storeId={STORE_ID} />
    </div>
  );
}

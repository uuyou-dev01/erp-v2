import { redirect } from "next/navigation";

export default function InventoryCoverageRedirectPage() {
  redirect("/inventory/sellable");
}

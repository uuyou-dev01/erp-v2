import { redirect } from "next/navigation";

export default function PendingListingRedirectPage() {
  redirect("/inventory/sellable?unlisted=1");
}

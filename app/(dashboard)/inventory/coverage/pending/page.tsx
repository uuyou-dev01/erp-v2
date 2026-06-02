import { redirect } from "next/navigation";

export default function PendingCoverageRedirectPage() {
  redirect("/inventory/sellable?unlisted=1");
}

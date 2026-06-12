import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function PendingCoverageRedirectPage() {
  redirect("/inventory/sellable?unlisted=1");
}

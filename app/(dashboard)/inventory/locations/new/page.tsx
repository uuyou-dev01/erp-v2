import { redirect } from "next/navigation";
import { safeLocationReturnPath } from "@/lib/application/location-create-navigation";

export const dynamic = "force-dynamic";

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const query = new URLSearchParams({ create: "1" });
  const safeReturnTo = safeLocationReturnPath(returnTo);
  if (safeReturnTo) query.set("returnTo", safeReturnTo);
  redirect(`/inventory/locations?${query.toString()}`);
}

import { redirect } from "next/navigation";

export default async function LegacyTeamReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === "string") params.set(key, value);
  }
  redirect(`/reports/workload${params.size ? `?${params.toString()}` : ""}`);
}

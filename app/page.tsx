import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isMobileUserAgent } from "@/lib/mobile/user-agent";

export default async function Home() {
  const userAgent = (await headers()).get("user-agent");
  redirect(isMobileUserAgent(userAgent) ? "/m" : "/workbench");
}

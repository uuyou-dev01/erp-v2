import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth/user-context";

export async function requireMobilePageContext(nextPath = "/m") {
  const safeNextPath = nextPath.startsWith("/m") ? nextPath : "/m";

  try {
    return await requireUserContext();
  } catch (error) {
    if (error instanceof Error && error.message === "请先登录") {
      redirect(`/login?next=${encodeURIComponent(safeNextPath)}`);
    }
    throw error;
  }
}

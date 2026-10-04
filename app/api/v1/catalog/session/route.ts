import { NextResponse } from "next/server";
import { z } from "zod";
import { loginAction } from "@/app/actions/session";
import { CatalogError, catalogErrorResponse, readCatalogJson } from "@/lib/catalog/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = z
      .object({ email: z.string().email().max(320), password: z.string().min(1).max(1024) })
      .strict()
      .parse(await readCatalogJson(request, 8192));
    const form = new FormData();
    form.set("email", input.email);
    form.set("password", input.password);
    // Reuse web login, including rate limits, audit and session revocation checks.
    const result = await loginAction(form);
    if (!result.success)
      throw new CatalogError("LOGIN_FAILED", result.error, /频繁/.test(result.error) ? 429 : 401);
    return NextResponse.json(
      { success: true, email: result.email },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

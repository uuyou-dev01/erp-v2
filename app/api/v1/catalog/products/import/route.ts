import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUserContext } from "@/lib/auth/user-context";
import { catalogImportSchema } from "@/lib/catalog/import-contract";
import { importCatalog } from "@/lib/catalog/import-service";
import { catalogErrorResponse, readCatalogJson } from "@/lib/catalog/http";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const input = catalogImportSchema.parse(await readCatalogJson(request));
    const context = await requireUserContext({ storeId: input.storeId });
    await assertMobileRateLimit({
      organizationId: context.organizationId,
      subjectId: context.userId,
      key: "catalog-import",
      limit: 30,
    });
    const result = await importCatalog(
      input,
      context,
      new URL(request.url).searchParams.get("dryRun") === "1"
    );
    if (result.status === "created") {
      revalidatePath("/inventory/skus");
      revalidatePath("/inventory/sellable");
      revalidatePath("/product-intelligence");
    }
    return NextResponse.json(
      { success: true, ...result },
      { status: result.status === "created" ? 201 : 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/user-context";
import { prisma } from "@/lib/prisma";
import { catalogErrorResponse, CatalogError } from "@/lib/catalog/http";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const storeId = params.get("storeId");
    if (!storeId) throw new CatalogError("STORE_REQUIRED", "请指定 storeId");
    const context = await requireUserContext({ storeId });
    const id = params.get("id");
    if (id) {
      const product = await prisma.sKU.findFirst({
        where: { id, storeId: context.activeStoreId },
        include: { childSkus: { orderBy: { code: "asc" } } },
      });
      if (!product) throw new CatalogError("NOT_FOUND", "商品不存在", 404);
      return NextResponse.json(
        { success: true, product },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
    const query = params.get("query")?.trim().slice(0, 200);
    const offset = Number(params.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new CatalogError("INVALID_OFFSET", "offset 必须为非负整数");
    const products = await prisma.sKU.findMany({
      where: {
        storeId: context.activeStoreId,
        parentSkuId: null,
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { code: { contains: query, mode: "insensitive" as const } },
                { manufacturerCode: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        brand: true,
        categoryId: true,
        catalogRole: true,
        _count: { select: { childSkus: true } },
      },
      orderBy: { id: "asc" },
      take: 21,
      skip: offset,
    });
    return NextResponse.json(
      {
        success: true,
        products: products.slice(0, 20),
        nextOffset: products.length > 20 ? offset + 20 : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return catalogErrorResponse(error);
  }
}

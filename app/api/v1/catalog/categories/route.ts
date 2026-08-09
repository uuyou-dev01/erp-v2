import { NextResponse } from "next/server";
import {
  backfillLegacyProductCategories,
  listVisibleProductCategories,
} from "@/lib/application/product-category-service";
import { requireUserContext } from "@/lib/auth/user-context";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    const context = await requireUserContext();
    const url = new URL(request.url);
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const format = url.searchParams.get("format")?.toLowerCase() ?? "json";
    await backfillLegacyProductCategories(context.organizationId);
    const categories = await listVisibleProductCategories(context.organizationId, {
      includeInactive,
    });

    if (format === "csv") {
      const header = [
        "id",
        "scope",
        "code",
        "name",
        "parentId",
        "canonicalCategoryId",
        "path",
        "level",
        "status",
        "aliases",
      ];
      const rows = categories.map((category) =>
        [
          category.id,
          category.scope,
          category.code,
          category.name,
          category.parentId,
          category.canonicalCategoryId,
          category.path,
          category.level,
          category.status,
          category.aliases.join("|"),
        ]
          .map(csvCell)
          .join(",")
      );
      return new NextResponse([header.join(","), ...rows].join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="product-categories.csv"',
        },
      });
    }

    return NextResponse.json({
      version: "1",
      organizationId: context.organizationId,
      exportedAt: new Date().toISOString(),
      categories,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "无法导出商品分类",
      },
      { status: 401 }
    );
  }
}

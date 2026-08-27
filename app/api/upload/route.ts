import { NextRequest, NextResponse } from "next/server";
import { MAX_ASSET_BYTES } from "@/lib/assets/image-validation";
import { storeUploadedImage } from "@/lib/assets/storage";
import { requireAuthenticatedUser, requireUserContext } from "@/lib/auth/user-context";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";
import { prisma } from "@/lib/prisma";
import { logRuntimeError } from "@/lib/runtime/structured-log";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES + 512_000) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_ASSET_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum size is 8MB." }, { status: 400 });
    }
    const requestedPurpose = String(formData.get("purpose") || "BUSINESS_EVIDENCE");
    const purpose = requestedPurpose === "CATALOG_IMAGE"
      ? "CATALOG_IMAGE"
      : requestedPurpose === "INTELLIGENCE_IMAGE"
        ? "INTELLIGENCE_IMAGE"
        : "BUSINESS_EVIDENCE";
    const visibility = formData.get("visibility") === "CATALOG_PUBLIC"
      ? "CATALOG_PUBLIC"
      : "ORGANIZATION_PRIVATE";
    const collaborationTaskId = String(formData.get("taskId") || "").trim();
    let scope: {
      organizationId: string;
      storeId: string;
      refType?: string;
      refId?: string;
    };
    if (collaborationTaskId) {
      const task = await prisma.task.findFirst({
        where: {
          id: collaborationTaskId,
          type: "SHIP_ORDER",
          refType: "CUSTOMER_ORDER",
          assignedToId: user.id,
          status: { in: ["ASSIGNED", "IN_PROGRESS", "OVERDUE"] },
          fulfillmentLocationId: { not: null },
        },
        select: {
          organizationId: true,
          storeId: true,
          refType: true,
          refId: true,
          fulfillmentLocationId: true,
        },
      });
      if (!task?.fulfillmentLocationId) throw new Error("发货任务不存在或未指派给你");
      const [order, roster] = await Promise.all([
        prisma.customerOrder.findFirst({
          where: { id: task.refId, storeId: task.storeId },
          select: { id: true },
        }),
        prisma.locationFulfiller.findFirst({
          where: {
            organizationId: task.organizationId,
            locationId: task.fulfillmentLocationId,
            userId: user.id,
            status: "ACTIVE",
          },
          select: { id: true },
        }),
      ]);
      if (!order || !roster) throw new Error("发货任务权限已失效");
      if (purpose !== "BUSINESS_EVIDENCE" || visibility !== "ORGANIZATION_PRIVATE") {
        throw new Error("协作任务只能上传私有业务凭证");
      }
      scope = {
        organizationId: task.organizationId,
        storeId: task.storeId,
        refType: task.refType,
        refId: task.refId,
      };
    } else {
      const context = await requireUserContext();
      scope = { organizationId: context.organizationId, storeId: context.activeStoreId };
    }
    await assertMobileRateLimit({
      organizationId: scope.organizationId,
      subjectId: user.id,
      key: "desktop-asset-upload",
      limit: 30,
      windowSeconds: 60,
    });
    const result = await storeUploadedImage({
      bytes: Buffer.from(await file.arrayBuffer()),
      declaredMimeType: file.type,
      originalName: file.name,
      organizationId: scope.organizationId,
      storeId: scope.storeId,
      userId: user.id,
      purpose,
      visibility,
      refType: scope.refType,
      refId: scope.refId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload file";
    if (/频繁|限流/.test(message)) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    const clientError = /图片|文件|公开|任务|权限|凭证/.test(message);
    if (!clientError) logRuntimeError("desktop_asset_upload_failed", error);
    return NextResponse.json(
      { error: clientError ? message : "Failed to upload file" },
      { status: clientError ? 400 : 500 }
    );
  }
}

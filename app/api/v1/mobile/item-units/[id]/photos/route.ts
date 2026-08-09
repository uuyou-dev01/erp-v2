import { NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/user-context";
import { requireActiveCompanionDevice } from "@/lib/mobile/device-auth";
import { mobileApiError } from "@/lib/mobile/http";
import {
  attachMobileAssetsToItemUnit,
  getMobileItemUnitPhotoTarget,
} from "@/lib/mobile/item-unit-photos";
import { assertMobileRateLimit } from "@/lib/mobile/rate-limit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [context, { id }] = await Promise.all([requireUserContext(), params]);
    const item = await getMobileItemUnitPhotoTarget(id, context);
    if (!item) throw new Error("单件不存在或当前账号没有查看权限");
    return NextResponse.json({
      item: {
        id: item.id,
        photos: item.photos,
        updatedAt: item.updatedAt,
      },
    });
  } catch (error) {
    return mobileApiError(error, "无法读取单件照片");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ context, device }, { id }, body] = await Promise.all([
      requireActiveCompanionDevice(),
      params,
      request.json() as Promise<{ assetIds?: string[] }>,
    ]);
    await assertMobileRateLimit({
      organizationId: context.organizationId,
      subjectId: device.id,
      key: "item-unit-photo-attach",
      limit: 30,
    });
    const result = await attachMobileAssetsToItemUnit({
      itemUnitId: id,
      assetIds: Array.isArray(body.assetIds) ? body.assetIds : [],
      context,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return mobileApiError(error, "无法保存单件照片");
  }
}

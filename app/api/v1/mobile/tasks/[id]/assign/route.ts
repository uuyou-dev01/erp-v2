import { NextResponse } from "next/server";
import { assignMobileTaskAction } from "@/app/actions/mobile";
import { mobileApiError } from "@/lib/mobile/http";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, body] = await Promise.all([params, request.json() as Promise<{ assignedToId?: string; dueAt?: string; note?: string }>]);
    if (!body.assignedToId?.trim()) throw new Error("请选择负责人");
    const result = await assignMobileTaskAction(decodeURIComponent(id), body.assignedToId, { dueAt: body.dueAt, note: body.note });
    if (!result.success) throw new Error(result.error);
    return NextResponse.json(result);
  } catch (error) {
    return mobileApiError(error, "委托失败");
  }
}

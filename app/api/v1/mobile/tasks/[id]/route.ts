import { NextResponse } from "next/server";
import { getMobileTask } from "@/lib/mobile/tasks";
import { mobileApiError } from "@/lib/mobile/http";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await getMobileTask(decodeURIComponent(id));
    if (!task) return NextResponse.json({ error: { code: "NOT_FOUND", message: "任务不存在或已处理" } }, { status: 404 });
    return NextResponse.json(task);
  } catch (error) {
    return mobileApiError(error, "无法加载任务详情");
  }
}

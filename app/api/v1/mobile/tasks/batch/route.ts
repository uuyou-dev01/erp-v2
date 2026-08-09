import { NextResponse } from "next/server";
import { executeMobileTaskAction } from "@/app/actions/mobile";
import { getMobileTask } from "@/lib/mobile/tasks";
import { mobileApiError } from "@/lib/mobile/http";
import { getMobileFeatureFlags } from "@/lib/mobile/features";

const BATCH_ACTIONS = new Set(["fillLogistics", "confirmArrival", "receivePurchase", "inbound"]);

export async function POST(request: Request) {
  try {
    if (!getMobileFeatureFlags().batchActions) throw new Error("批量处理功能暂未开放");
    const body = await request.json() as {
      batchId?: string;
      action?: string;
      items?: Array<{ taskId?: string; fields?: Record<string, string | boolean | string[] | undefined> }>;
    };
    const batchId = body.batchId?.trim();
    const action = body.action?.trim();
    const items = body.items ?? [];
    if (!batchId) throw new Error("缺少批量操作幂等键");
    if (!action || !BATCH_ACTIONS.has(action)) throw new Error("该动作不支持批量处理");
    if (!items.length || items.length > 20) throw new Error("每次请选择 1–20 个任务");

    const results = [];
    for (const [index, item] of items.entries()) {
      if (!item.taskId) {
        results.push({ taskId: null, success: false, error: "缺少任务 ID" });
        continue;
      }
      try {
        const detail = await getMobileTask(item.taskId);
        if (!detail) throw new Error("任务不存在或已经处理");
        if (detail.summary.primaryAction !== action && !(action === "confirmArrival" && detail.summary.primaryAction === "receivePurchase")) {
          throw new Error("任务节点已变化");
        }
        const result = await executeMobileTaskAction({
          taskId: item.taskId,
          action: detail.summary.primaryAction,
          expectedVersion: detail.expectedVersion,
          idempotencyKey: `${batchId}:${index}:${item.taskId}`,
          fields: item.fields ?? {},
        });
        results.push({ taskId: item.taskId, success: true, result });
      } catch (error) {
        results.push({ taskId: item.taskId, success: false, error: error instanceof Error ? error.message : "处理失败" });
      }
    }
    return NextResponse.json({
      batchId,
      successCount: results.filter((result) => result.success).length,
      failureCount: results.filter((result) => !result.success).length,
      results,
    });
  } catch (error) {
    return mobileApiError(error, "批量任务处理失败");
  }
}

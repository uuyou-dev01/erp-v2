import { NextResponse } from "next/server";

export function mobileApiError(error: unknown, fallback = "请求失败") {
  const message = error instanceof Error ? error.message : fallback;
  const status = /登录|会话|无权|权限|设备|绑定|撤销/.test(message)
    ? 401
    : /过于频繁|限流/.test(message)
      ? 429
    : /已发生变化|节点已变化|正在处理中|幂等键/.test(message)
      ? 409
      : /不存在|已处理/.test(message)
        ? 404
        : 400;
  return NextResponse.json(
    { error: { code: status === 429 ? "RATE_LIMITED" : status === 409 ? "CONFLICT" : status === 401 ? "UNAUTHORIZED" : "INVALID_REQUEST", message } },
    { status }
  );
}

export function parseLimit(value: string | null, fallback = 30, max = 80) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

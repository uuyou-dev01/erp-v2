import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logRuntimeError } from "@/lib/runtime/structured-log";

export class CatalogError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export function assertCatalogOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_BASE_URL || request.url).origin;
  if (origin && origin !== expected)
    throw new CatalogError("ORIGIN_MISMATCH", "请求来源不匹配", 403);
}

export async function readCatalogJson(request: Request, maxBytes = 1_000_000) {
  assertCatalogOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new CatalogError("CONTENT_TYPE", "请使用 application/json", 415);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new CatalogError("INVALID_JSON", "请求正文不能为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new CatalogError("BODY_TOO_LARGE", "导入资料过大", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CatalogError("INVALID_JSON", "JSON 格式错误");
  }
}

export function catalogErrorResponse(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION",
          message: "请修正输入字段",
          issues: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 }
    );
  if (error instanceof CatalogError)
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  const message = error instanceof Error ? error.message : "";
  if (/请先登录|登录状态已失效/.test(message))
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message } },
      { status: 401 }
    );
  if (/无权|没有有效主体|当前用户不存在/.test(message))
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message } },
      { status: 403 }
    );
  if (/过于频繁/.test(message))
    return NextResponse.json(
      { success: false, error: { code: "RATE_LIMITED", message } },
      { status: 429 }
    );
  logRuntimeError("catalog_api_failed", error);
  return NextResponse.json(
    {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "处理失败，请稍后使用相同 externalId 重试" },
    },
    { status: 500 }
  );
}

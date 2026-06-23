export type ActionSuccess<T extends Record<string, unknown> = Record<string, never>> =
  { success: true } & T;

export interface ActionFailure {
  success: false;
  error: string;
}

export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ActionSuccess<T>
  | ActionFailure;

export function actionSuccess<T extends Record<string, unknown>>(
  payload: T
): ActionSuccess<T> {
  return { success: true, ...payload };
}

export function actionFailure(error: string): ActionFailure {
  return { success: false, error };
}

export function isActionFailure(result: unknown): result is ActionFailure {
  return (
    result !== null &&
    typeof result === "object" &&
    "success" in result &&
    "error" in result &&
    (result as { success: unknown }).success === false &&
    typeof (result as { error: unknown }).error === "string"
  );
}

export function toActionFailure(error: unknown, fallback = "操作失败，请重试"): ActionFailure {
  return actionFailure(error instanceof Error ? error.message : fallback);
}

export function logRuntimeError(
  event: string,
  error: unknown,
  details: Record<string, string | number | boolean | null> = {}
) {
  const normalized = error instanceof Error
    ? { errorName: error.name, errorMessage: error.message }
    : { errorName: "UnknownError", errorMessage: String(error) };
  console.error(JSON.stringify({
    level: "error",
    event,
    timestamp: new Date().toISOString(),
    ...details,
    ...normalized,
  }));
}

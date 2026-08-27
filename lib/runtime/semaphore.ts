type WaitingTask = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

class RuntimeSemaphore {
  private active = 0;
  private readonly queue: WaitingTask[] = [];

  constructor(private readonly limit: number) {}

  async acquire(timeoutMs: number) {
    if (this.active < this.limit) {
      this.active += 1;
      return this.releaseOnce();
    }

    return new Promise<() => void>((resolve, reject) => {
      const waiting: WaitingTask = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(waiting);
          if (index >= 0) this.queue.splice(index, 1);
          reject(new Error("任务排队超时，请稍后重试"));
        }, timeoutMs),
      };
      this.queue.push(waiting);
    });
  }

  private releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.releaseOnce());
        return;
      }
      this.active = Math.max(0, this.active - 1);
    };
  }
}
const globalSemaphores = globalThis as typeof globalThis & {
  __erpRuntimeSemaphores?: Map<string, RuntimeSemaphore>;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function semaphore(name: string, envName: string) {
  const registry = globalSemaphores.__erpRuntimeSemaphores ?? new Map<string, RuntimeSemaphore>();
  globalSemaphores.__erpRuntimeSemaphores = registry;
  const existing = registry.get(name);
  if (existing) return existing;
  const created = new RuntimeSemaphore(positiveInteger(process.env[envName], 1));
  registry.set(name, created);
  return created;
}

export async function withRuntimeSlot<T>(input: {
  name: "ocr" | "browser";
  concurrencyEnv: "OCR_CONCURRENCY" | "CAPTURE_CONCURRENCY";
  timeoutEnv: "OCR_QUEUE_TIMEOUT_MS" | "CAPTURE_QUEUE_TIMEOUT_MS";
  defaultTimeoutMs: number;
  run: () => Promise<T>;
}) {
  const release = await semaphore(input.name, input.concurrencyEnv).acquire(
    positiveInteger(process.env[input.timeoutEnv], input.defaultTimeoutMs)
  );
  try {
    return await input.run();
  } finally {
    release();
  }
}

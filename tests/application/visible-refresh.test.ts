import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
}));

import { useVisibleRefresh } from "@/components/notifications/use-visible-refresh";

describe("visible refresh triggers", () => {
  let page: EventTarget & { visibilityState: string };
  let browser: EventTarget;
  let cleanups: Array<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    harness.effects.length = 0;
    page = Object.assign(new EventTarget(), { visibilityState: "visible" });
    browser = new EventTarget();
    vi.stubGlobal("document", page);
    vi.stubGlobal("window", browser);
    cleanups = [];
  });

  afterEach(() => {
    cleanups.forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function mount() {
    for (const effect of harness.effects) {
      const cleanup = effect();
      if (cleanup) cleanups.push(cleanup);
    }
    await Promise.resolve();
  }

  it("refreshes on entry, focus, visibility and data changes without periodic queries", async () => {
    const callback = vi.fn();
    useVisibleRefresh(callback, { intervalMs: null, refreshKey: "task-1" });
    await mount();
    expect(callback).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120000);
    expect(callback).toHaveBeenCalledTimes(1);
    for (const [target, event] of [
      [browser, "focus"],
      [page, "visibilitychange"],
      [browser, "erp:data-changed"],
    ] as const) {
      target.dispatchEvent(new Event(event));
      await Promise.resolve();
    }
    expect(callback).toHaveBeenCalledTimes(4);
    page.visibilityState = "hidden";
    browser.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledTimes(4);
    cleanups.forEach((cleanup) => cleanup());
    page.visibilityState = "visible";
    browser.dispatchEvent(new Event("focus"));
    expect(callback).toHaveBeenCalledTimes(4);
  });

  it("retains the default notification polling behavior", async () => {
    const callback = vi.fn();
    useVisibleRefresh(callback);
    await mount();
    await vi.advanceTimersByTimeAsync(30000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("queues a new action during an in-flight request without concurrent reads", async () => {
    let complete!: () => void;
    const callback = vi.fn().mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    const refresh = useVisibleRefresh(callback, { intervalMs: null });
    await mount();
    await refresh();
    await refresh();
    expect(callback).toHaveBeenCalledTimes(1);
    complete();
    await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

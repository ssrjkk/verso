import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savedTick = process.env.PUBLISH_DUE_TICK_MS;
const savedRuntime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  delete process.env.PUBLISH_DUE_TICK_MS;
  delete process.env.NEXT_RUNTIME;
});

afterEach(() => {
  vi.useRealTimers();
  if (savedTick === undefined) delete process.env.PUBLISH_DUE_TICK_MS;
  else process.env.PUBLISH_DUE_TICK_MS = savedTick;
  if (savedRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = savedRuntime;
});

async function register() {
  const mod = await import("@/instrumentation");
  return mod.register();
}

describe("instrumentation: опциональный интервал publishDue", () => {
  it("по умолчанию интервал не стартует", async () => {
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("PUBLISH_DUE_TICK_MS планирует тик с заданным периодом", async () => {
    process.env.PUBLISH_DUE_TICK_MS = "60000";
    await register();
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(["0", "-5", "abc", ""])("мусор в PUBLISH_DUE_TICK_MS (%s) — интервал не стартует", async (v) => {
    process.env.PUBLISH_DUE_TICK_MS = v;
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("в edge runtime интервал не стартует (better-sqlite3 — только Node)", async () => {
    process.env.PUBLISH_DUE_TICK_MS = "60000";
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });
});

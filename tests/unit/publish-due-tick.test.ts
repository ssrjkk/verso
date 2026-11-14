import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const savedTick = process.env.PUBLISH_DUE_TICK_MS;
const savedWebhookTick = process.env.WEBHOOK_DRAIN_TICK_MS;
const savedRuntime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  delete process.env.PUBLISH_DUE_TICK_MS;
  // По умолчанию webhook-тик включён; для тестов publish-таймера глушим его,
  // чтобы счётчик таймеров был предсказуем.
  process.env.WEBHOOK_DRAIN_TICK_MS = "0";
  delete process.env.NEXT_RUNTIME;
});

afterEach(() => {
  vi.useRealTimers();
  if (savedTick === undefined) delete process.env.PUBLISH_DUE_TICK_MS;
  else process.env.PUBLISH_DUE_TICK_MS = savedTick;
  if (savedWebhookTick === undefined) delete process.env.WEBHOOK_DRAIN_TICK_MS;
  else process.env.WEBHOOK_DRAIN_TICK_MS = savedWebhookTick;
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

describe("instrumentation: тик доставки вебхуков", () => {
  it("по умолчанию включён (60с), чтобы outbox не зависел от внешнего cron", async () => {
    delete process.env.WEBHOOK_DRAIN_TICK_MS;
    await register();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("WEBHOOK_DRAIN_TICK_MS=0 выключает тик", async () => {
    process.env.WEBHOOK_DRAIN_TICK_MS = "0";
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("явный интервал планирует ровно один таймер", async () => {
    process.env.WEBHOOK_DRAIN_TICK_MS = "45000";
    await register();
    expect(vi.getTimerCount()).toBe(1);
  });

  it.each(["abc", ""])("некорректное значение (%s) не выключает доставку молча", async (v) => {
    process.env.WEBHOOK_DRAIN_TICK_MS = v;
    await register();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("в edge runtime тик не стартует", async () => {
    process.env.WEBHOOK_DRAIN_TICK_MS = "45000";
    process.env.NEXT_RUNTIME = "edge";
    await register();
    expect(vi.getTimerCount()).toBe(0);
  });
});

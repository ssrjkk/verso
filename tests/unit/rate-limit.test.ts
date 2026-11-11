import { describe, it, expect } from "vitest";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

const WINDOW = 60_000;

describe("token bucket", () => {
  it("пропускает в пределах capacity", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k1", { capacity: 5, windowMs: WINDOW }, 1000 + i).ok).toBe(true);
    }
  });

  it("сверх capacity — отказ с retryAfterMs > 0", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("k2", { capacity: 5, windowMs: WINDOW }, 1000);
    const r = checkRateLimit("k2", { capacity: 5, windowMs: WINDOW }, 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
      expect(r.retryAfterMs).toBeLessThanOrEqual(WINDOW);
    }
  });

  it("ведро пополняется со временем (токены капают равномерно)", () => {
    for (let i = 0; i < 2; i++) checkRateLimit("k3", { capacity: 2, windowMs: WINDOW }, 0);
    expect(checkRateLimit("k3", { capacity: 2, windowMs: WINDOW }, 0).ok).toBe(false);
    // Через пол-окна накапал 1 токен.
    expect(checkRateLimit("k3", { capacity: 2, windowMs: WINDOW }, WINDOW / 2).ok).toBe(true);
    expect(checkRateLimit("k3", { capacity: 2, windowMs: WINDOW }, WINDOW / 2).ok).toBe(false);
  });

  it("полное окно простоя восстанавливает capacity целиком", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("k4", { capacity: 3, windowMs: WINDOW }, 0);
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k4", { capacity: 3, windowMs: WINDOW }, WINDOW + 1 + i).ok).toBe(true);
    }
  });

  it("ключи изолированы друг от друга", () => {
    for (let i = 0; i < 2; i++) checkRateLimit("iso-a", { capacity: 2, windowMs: WINDOW }, 0);
    expect(checkRateLimit("iso-a", { capacity: 2, windowMs: WINDOW }, 0).ok).toBe(false);
    expect(checkRateLimit("iso-b", { capacity: 2, windowMs: WINDOW }, 0).ok).toBe(true);
  });

  it("Retry-After округляется вверх до секунд, минимум 1", () => {
    expect(rateLimitHeaders(1)).toEqual({ "Retry-After": "1" });
    expect(rateLimitHeaders(1000)).toEqual({ "Retry-After": "1" });
    expect(rateLimitHeaders(1001)).toEqual({ "Retry-After": "2" });
    expect(rateLimitHeaders(0)).toEqual({ "Retry-After": "1" });
  });

  it("при переполнении (>10k ведер) старые вычищаются, лимит продолжает работать", () => {
    for (let i = 0; i < 10_001; i++) {
      checkRateLimit(`bulk-${i}`, { capacity: 1, windowMs: WINDOW }, 0);
    }
    // Скачок времени: prune удаляет ведра, не обновлявшиеся дольше 2 окон.
    expect(checkRateLimit("after-prune", { capacity: 1, windowMs: WINDOW }, WINDOW * 10).ok).toBe(
      true,
    );
  });
});

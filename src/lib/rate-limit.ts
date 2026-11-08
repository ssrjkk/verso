/**
 * In-memory token bucket (per-instance).
 *
 * Ограничения осознанно: single-instance SQLite-приложение — общего
 * распределённого лимита нет; при нескольких инстансах у каждого свой
 * бюджет (fail-open в сторону доступности, не безопасности: аутентификация
 * и авторизация от этого не зависят). `now` — явный параметр ради
 * детерминированных тестов без fake timers.
 */

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

type Bucket = { tokens: number; updatedAt: number };

const buckets = new Map<string, Bucket>();

const MAX_BUCKETS = 10_000;

function prune(now: number, windowMs: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (now - bucket.updatedAt > windowMs * 2) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  opts: { capacity: number; windowMs: number },
  now: number = Date.now(),
): RateLimitResult {
  const { capacity, windowMs } = opts;
  prune(now, windowMs);
  const perTokenMs = windowMs / capacity;
  const stored = buckets.get(key);
  const tokens = stored
    ? Math.min(capacity, stored.tokens + (now - stored.updatedAt) / perTokenMs)
    : capacity;
  if (tokens >= 1) {
    buckets.set(key, { tokens: tokens - 1, updatedAt: now });
    return { ok: true };
  }
  buckets.set(key, { tokens, updatedAt: now });
  return { ok: false, retryAfterMs: Math.max(1, Math.ceil((1 - tokens) * perTokenMs)) };
}

export function rateLimitHeaders(retryAfterMs: number): Record<string, string> {
  return { "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000))) };
}

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Проверка `Authorization: Bearer <CRON_SECRET>` для cron-маршрутов.
 * Сравнение идёт по SHA-256 дайджестам через `timingSafeEqual`: константное
 * время и без утечки длины секрета. Без настроенного `CRON_SECRET` —
 * fail closed (маршрут обязан ответить 503, а не работать открытым).
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const provided = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(provided, expected);
}

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronAuthorized } from "@/lib/cron-auth";
import { publishDue } from "@/lib/publish-due";

/**
 * POST /api/cron/publish-due — публикация просроченных SCHEDULED.
 * Авторизация: `Authorization: Bearer <CRON_SECRET>` (см. `cronAuthorized`).
 * Без настроенного CRON_SECRET — fail closed (503), а не открытый триггер.
 * Вебхуки уходят в outbox, их доставку добивает `/api/cron/webhooks` или тик.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const published = await publishDue(prisma, new Date());
  return NextResponse.json({ ok: true, published });
}

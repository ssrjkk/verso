import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — проба живости для балансировщика или uptime-монитора.
 *
 * Проверяем только доступность БД: приложение без SQLite всё равно не может
 * обслуживать запросы. Наружу не отдаём текст ошибки, версии и пути; ответ
 * не кэшируется, чтобы проба видела реальное состояние, а не CDN-копию.
 */
export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json(
      { status: "ok", checks: { database: "ok" } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", checks: { database: "down" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishDue } from "@/lib/publish-due";

/**
 * POST /api/cron/publish-due — публикация просроченных SCHEDULED.
 * Авторизация: `Authorization: Bearer <CRON_SECRET>`, сравнение через
 * SHA-256 + timingSafeEqual (константное время, без утечки длины).
 * Без настроенного CRON_SECRET — fail closed (503), а не открытый триггер.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  const a = createHash("sha256").update(match[1]).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const published = await publishDue(prisma, new Date());
  return NextResponse.json({ ok: true, published });
}

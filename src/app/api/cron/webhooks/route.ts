import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronAuthorized } from "@/lib/cron-auth";
import { drainWebhookDeliveries, maybePruneWebhookDeliveries } from "@/lib/webhook-outbox";

/**
 * POST /api/cron/webhooks — добить созревшие доставки outbox.
 *
 * Нужен при выключенном внутреннем тике (`WEBHOOK_DRAIN_TICK_MS=0`) или как
 * страховка для нескольких инстансов. Маршрут идемпотентен: claim строки
 * условный, параллельные вызовы не дублируют отправку. Заодно чистит
 * терминальные доставки (не чаще раза в 6 часов на процесс). Без
 * `CRON_SECRET` отвечает 503 (fail closed), с чужим секретом — 401.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
  }
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await drainWebhookDeliveries(prisma);
  const pruned = await maybePruneWebhookDeliveries(prisma);
  return NextResponse.json({ ...result, pruned });
}

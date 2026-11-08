/**
 * Server startup hook: опциональный интервал публикации по расписанию.
 *
 * Выключен по умолчанию. Включается только явным
 * `PUBLISH_DUE_TICK_MS` (self-hosted без внешнего cron). Внешний cron
 * (`POST /api/cron/publish-due` с `CRON_SECRET`) предпочтительнее:
 * при нескольких инстансах тики дублируются, но `publishDue`
 * идемпотентна и лишний тик публикует ноль записей.
 */
export function register() {
  const everyMs = Number(process.env.PUBLISH_DUE_TICK_MS ?? "");
  if (!Number.isFinite(everyMs) || everyMs <= 0) return;
  // better-sqlite3 — только Node.js runtime; в edge интервал не стартует.
  if (process.env.NEXT_RUNTIME === "edge") return;
  const tick = async () => {
    try {
      const [{ prisma }, { publishDue }] = await Promise.all([
        import("@/lib/prisma"),
        import("@/lib/publish-due"),
      ]);
      await publishDue(prisma, new Date());
    } catch {
      // Планировщик никогда не роняет сервер.
    }
  };
  const timer = setInterval(() => void tick(), everyMs);
  timer.unref?.();
}

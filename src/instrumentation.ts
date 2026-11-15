/**
 * Server startup hooks: опциональная публикация по расписанию и доставка
 * вебхуков из outbox.
 *
 * Публикация выключена по умолчанию (`PUBLISH_DUE_TICK_MS` пусто). Внешний
 * cron (`POST /api/cron/publish-due` с `CRON_SECRET`) предпочтительнее:
 * при нескольких инстансах тики дублируются, но `publishDue` идемпотентна.
 *
 * Доставка вебхуков включена по умолчанию раз в 60 секунд: pending-строки
 * outbox должны уходить и без внешнего cron. `WEBHOOK_DRAIN_TICK_MS=0`
 * выключает тик — тогда используйте `/api/cron/webhooks`. Claim в outbox
 * условный, поэтому параллельные тики/инстансы не дублируют отправку.
 */
/**
 * Разбирает интервал из env. Пустое значение — «не задано» (fallback),
 * `0` — явное выключение, мусор — предупреждение и fallback, чтобы опечатка
 * в конфиге не выключала доставку молча.
 */
function readIntervalMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const ms = Number(raw);
  if (Number.isFinite(ms) && ms >= 0) return ms;
  console.warn(
    `[instrumentation] Некорректный интервал "${raw}", использую ${fallback} мс`,
  );
  return fallback;
}

export function register() {
  // better-sqlite3 — только Node.js runtime; в edge таймеры не стартуют.
  if (process.env.NEXT_RUNTIME === "edge") return;

  const publishEveryMs = readIntervalMs(process.env.PUBLISH_DUE_TICK_MS, 0);
  if (publishEveryMs > 0) {
    const timer = setInterval(async () => {
      try {
        const [{ prisma }, { publishDue }] = await Promise.all([
          import("@/lib/prisma"),
          import("@/lib/publish-due"),
        ]);
        await publishDue(prisma, new Date());
      } catch {
        // Планировщик никогда не роняет сервер.
      }
    }, publishEveryMs);
    timer.unref?.();
  }

  const webhookEveryMs = readIntervalMs(process.env.WEBHOOK_DRAIN_TICK_MS, 60_000);
  if (webhookEveryMs > 0) {
    const timer = setInterval(async () => {
      try {
        const [{ prisma }, { drainWebhookDeliveries, maybePruneWebhookDeliveries }] =
          await Promise.all([
            import("@/lib/prisma"),
            import("@/lib/webhook-outbox"),
          ]);
        await drainWebhookDeliveries(prisma);
        // Терминальные доставки не копятся вечно; внутри — не чаще 6 часов.
        await maybePruneWebhookDeliveries(prisma);
      } catch {
        // Недоставленный вебхук остаётся в outbox и будет повторён.
      }
    }, webhookEveryMs);
    timer.unref?.();
  }
}

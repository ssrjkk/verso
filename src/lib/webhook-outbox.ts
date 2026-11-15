import type { Prisma, PrismaClient } from "@prisma/client";
import { deliverWebhook, type DeliveryResult } from "@/lib/webhook";

/**
 * Транзакционный outbox вебхуков.
 *
 * `enqueueWebhooks` вызывается внутри той же транзакции, что и изменение
 * записи: событие и payload фиксируются атомарно с контентом. Сеть не входит
 * в транзакцию — `drainWebhookDeliveries` забирает созревшие доставки
 * отдельными lease-шагами. Падение процесса между коммитом и HTTP-запросом
 * больше не теряет событие: строка остаётся PENDING/DELIVERING и будет
 * подхвачена следующим тиком.
 *
 * Гарантия — at-least-once. Процесс может упасть после отправки, но до
 * записи DELIVERED; тогда событие уйдёт повторно. Получатель должен быть
 * идемпотентным (например, по `id` события, если он появится в payload).
 */

export const WEBHOOK_EVENTS = ["entry.published", "entry.updated"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export type WebhookDrainResult = {
  claimed: number;
  delivered: number;
  retried: number;
  failed: number;
};

export type WebhookDrainOptions = {
  now?: Date;
  maxAttempts?: number;
  baseBackoffMs?: number;
  leaseMs?: number;
  batchSize?: number;
};

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_BASE_BACKOFF_MS = 60_000;
const DEFAULT_LEASE_MS = 10 * 60_000;
const DEFAULT_BATCH_SIZE = 50;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const MAX_ERROR_LENGTH = 1000;
const DEFAULT_RETENTION_DAYS = 30;
const PRUNE_INTERVAL_MS = 6 * 60 * 60_000;

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function retentionDaysFromEnv(): number {
  const raw = process.env.WEBHOOK_RETENTION_DAYS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_RETENTION_DAYS;
  const value = Number(raw);
  if (Number.isFinite(value) && value >= 0) return Math.floor(value);
  // Опечатка не должна молча отключать очистку: работаем по дефолту.
  console.warn(
    `[webhook-outbox] Некорректный WEBHOOK_RETENTION_DAYS "${raw}", использую ${DEFAULT_RETENTION_DAYS}`,
  );
  return DEFAULT_RETENTION_DAYS;
}

/**
 * Удаляет терминальные доставки старше retention. У `DELIVERED`/`FAILED`
 * `nextAttemptAt` равен времени завершения, поэтому выборку покрывает
 * индекс `(status, nextAttemptAt)`. `WEBHOOK_RETENTION_DAYS=0` выключает
 * очистку; пустое или некорректное значение — дефолт 30 дней.
 */
export async function pruneWebhookDeliveries(
  prisma: PrismaClient,
  options: { now?: Date; retentionDays?: number } = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? retentionDaysFromEnv();
  if (retentionDays <= 0) return 0;

  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const result = await prisma.webhookDelivery.deleteMany({
    where: {
      status: { in: ["DELIVERED", "FAILED"] },
      nextAttemptAt: { lt: cutoff },
    },
  });
  return result.count;
}

let lastPruneAt = Number.NEGATIVE_INFINITY;

/**
 * Чистит outbox не чаще раза в 6 часов на процесс. Вызывается из тика
 * доставки и cron-маршрута; параллельные инстансы могут чистить
 * одновременно — `DELETE` идемпотентен.
 */
export async function maybePruneWebhookDeliveries(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  if (now.getTime() - lastPruneAt < PRUNE_INTERVAL_MS) return 0;
  const pruned = await pruneWebhookDeliveries(prisma, { now });
  // Фиксируем попытку только после успеха: временная ошибка БД не должна
  // отключать очистку на следующие 6 часов.
  lastPruneAt = now.getTime();
  return pruned;
}

type EnqueueClient = PrismaClient | Prisma.TransactionClient;

/**
 * Ставит по одной доставке на каждый активный endpoint, подписанный на
 * событие. Возвращает число созданных строк (0 — доставлять некому).
 * Ошибка записи outbox откатывает всю транзакцию: событие не должно
 * потеряться при успешном изменении контента.
 */
export async function enqueueWebhooks(
  db: EnqueueClient,
  event: WebhookEvent,
  payload: unknown,
): Promise<number> {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { isActive: true },
    select: { id: true, events: true },
  });
  const targets = endpoints.filter((endpoint) =>
    endpoint.events
      .split(",")
      .map((value) => value.trim())
      .includes(event),
  );
  if (targets.length === 0) return 0;

  const payloadJson = JSON.stringify(payload) ?? "null";
  await db.webhookDelivery.createMany({
    data: targets.map((endpoint) => ({
      endpointId: endpoint.id,
      event,
      payloadJson,
    })),
  });
  return targets.length;
}

/**
 * Забирает созревшие доставки и пытается отправить их по одной.
 *
 * Claim — условный `updateMany`: строка переходит в DELIVERING только если
 * всё ещё PENDING/DELIVERING и её `nextAttemptAt` не в будущем. Параллельные
 * drain'ы (тик, cron, kick после коммита) не отправляют одну строку дважды.
 * `nextAttemptAt` у DELIVERING — это lease: если процесс умер, строка снова
 * станет доступной после истечения срока.
 */
export async function drainWebhookDeliveries(
  prisma: PrismaClient,
  options: WebhookDrainOptions = {},
): Promise<WebhookDrainResult> {
  const now = options.now ?? new Date();
  const maxAttempts =
    options.maxAttempts ?? envNumber("WEBHOOK_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
  const baseBackoffMs =
    options.baseBackoffMs ??
    envNumber("WEBHOOK_BASE_BACKOFF_MS", DEFAULT_BASE_BACKOFF_MS);
  const leaseMs = options.leaseMs ?? envNumber("WEBHOOK_LEASE_MS", DEFAULT_LEASE_MS);
  const batchSize =
    options.batchSize ?? envNumber("WEBHOOK_DRAIN_BATCH", DEFAULT_BATCH_SIZE);

  const due = await prisma.webhookDelivery.findMany({
    where: {
      status: { in: ["PENDING", "DELIVERING"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: batchSize,
    select: { id: true },
  });

  const result: WebhookDrainResult = {
    claimed: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
  };

  for (const { id } of due) {
    const claim = await prisma.webhookDelivery.updateMany({
      where: {
        id,
        status: { in: ["PENDING", "DELIVERING"] },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: "DELIVERING",
        nextAttemptAt: new Date(now.getTime() + leaseMs),
      },
    });
    if (claim.count !== 1) continue;
    result.claimed += 1;

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id },
      include: {
        endpoint: {
          select: { id: true, url: true, secret: true, isActive: true },
        },
      },
    });
    // Endpoint удалён вместе с доставкой (onDelete: Cascade) — пропускаем.
    if (!delivery) continue;

    // Выключенный после постановки endpoint не получает событие. Это
    // осознанный FAILED, а не бесконечный retry: оператор уже сказал «не надо».
    if (!delivery.endpoint.isActive) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: "FAILED",
          lastAttemptAt: now,
          nextAttemptAt: now,
          error: "Endpoint disabled",
        },
      });
      result.failed += 1;
      continue;
    }

    let delivered: DeliveryResult;
    try {
      const payload = JSON.parse(delivery.payloadJson) as unknown;
      // Одна HTTP-попытка на drain: повторы планирует outbox, а не
      // внутрипроцессный sleep. Так backoff переживает рестарт.
      delivered = await deliverWebhook(delivery.endpoint, delivery.event, payload, {
        attempts: 1,
      });
    } catch (e) {
      delivered = {
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : "delivery failed",
      };
    }

    const attempts = delivery.attempts + 1;
    const error = delivered.ok
      ? null
      : (delivered.error ?? `HTTP ${delivered.status}`).slice(0, MAX_ERROR_LENGTH);

    if (delivered.ok) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: "DELIVERED",
          attempts,
          lastAttemptAt: now,
          nextAttemptAt: now,
          responseStatus: delivered.status || null,
          error: null,
          deliveredAt: now,
        },
      });
      result.delivered += 1;
    } else if (attempts >= maxAttempts) {
      await prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: "FAILED",
          attempts,
          lastAttemptAt: now,
          nextAttemptAt: now,
          responseStatus: delivered.status || null,
          error,
        },
      });
      result.failed += 1;
    } else {
      const backoffMs = Math.min(
        baseBackoffMs * 2 ** (attempts - 1),
        MAX_BACKOFF_MS,
      );
      await prisma.webhookDelivery.update({
        where: { id },
        data: {
          status: "PENDING",
          attempts,
          lastAttemptAt: now,
          nextAttemptAt: new Date(now.getTime() + backoffMs),
          responseStatus: delivered.status || null,
          error,
        },
      });
      result.retried += 1;
    }

    // lastStatus — сводка последней попытки в строке endpoint'а. Ошибка
    // этого update не должна прятать уже зафиксированный результат доставки.
    await prisma.webhookEndpoint
      .update({
        where: { id: delivery.endpoint.id },
        data: { lastStatus: String(delivered.status), lastDeliveryAt: now },
      })
      .catch(() => undefined);
  }

  return result;
}

// Один drain на клиент в пределах процесса: тик, cron и kick после коммита
// не должны накладываться друг на друга. Между процессами защищает claim.
const activeDrains = new WeakSet<object>();

/** Немедленный фоновый drain после коммита; ошибки не влияют на запрос. */
export function kickWebhookDrain(prisma: PrismaClient): void {
  if (activeDrains.has(prisma)) return;
  activeDrains.add(prisma);
  void drainWebhookDeliveries(prisma)
    .catch(() => undefined)
    .finally(() => {
      activeDrains.delete(prisma);
    });
}

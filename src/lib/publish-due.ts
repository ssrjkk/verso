import type { PrismaClient } from "@prisma/client";
import { fireWebhooks } from "@/lib/webhook";
import { buildEntrySnapshot } from "@/lib/entry-snapshot";

/**
 * Публикация записей по расписанию.
 *
 * Одна транзакция: SCHEDULED → PUBLISHED + publishedAt + ревизия.
 * Флип условный (`updateMany` с фильтром по статусу и дате): параллельный
 * прогон видит уже PUBLISHED и пропускает запись — ровно одна ревизия.
 * Повторный прогон ничего не находит — идемпотентность бесплатно.
 * Снапшот строится общим `buildEntrySnapshot` (скаляры + блоки + теги):
 * relations вырезаются, поэтому откат на эту ревизию восстанавливает
 * ровно то состояние, которое было на момент публикации.
 *
 * Вебхуки `entry.published` — только после коммита (fire-and-forget,
 * как в entry.publish). Время — явный параметр: тесты фиксируют `now`,
 * в проде передаётся `new Date()` (UTC, ISO-8601 в SQLite).
 */
export async function publishDue(prisma: PrismaClient, now: Date = new Date()): Promise<string[]> {
  const published = await prisma.$transaction(async (tx) => {
    const due = await tx.entry.findMany({
      where: { status: "SCHEDULED", scheduledFor: { lte: now } },
      include: { blocks: true, tags: { include: { tag: true } } },
      orderBy: { scheduledFor: "asc" },
    });
    const ids: string[] = [];
    for (const e of due) {
      const flipped = await tx.entry.updateMany({
        where: { id: e.id, status: "SCHEDULED", scheduledFor: { lte: now } },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      if (flipped.count !== 1) continue;
      const count = await tx.revision.count({ where: { entryId: e.id } });
      const tagNames = (e.tags ?? []).flatMap((t) => (t.tag?.name ? [t.tag.name] : []));
      await tx.revision.create({
        data: {
          entryId: e.id,
          version: count + 1,
          snapshotJson: buildEntrySnapshot(
            { ...e, status: "PUBLISHED", publishedAt: now },
            e.blocks,
            tagNames,
          ),
          changeNote: "Публикация по расписанию",
          // Ревизия системная по триггеру, авторство — владелец записи.
          authorId: e.authorId,
        },
      });
      ids.push(e.id);
    }
    return ids;
  });

  if (published.length > 0) {
    const entries = await prisma.entry.findMany({
      where: { id: { in: published } },
      // Теги — часть контракта payload, как в entry.publish.
      include: { blocks: true, tags: { include: { tag: true } } },
    });
    for (const entry of entries) {
      fireWebhooks(prisma, "entry.published", entry);
    }
  }
  return published;
}

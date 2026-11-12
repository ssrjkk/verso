import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, editorProcedure, adminProcedure } from "../trpc";
import { slugify } from "@/lib/slug";
import { toCsv, parseCsv, sanitizeCsvCell } from "@/lib/csv";
import { EntryStatus } from "@/lib/entry-status";
import { buildEntrySnapshot } from "@/lib/entry-snapshot";

type DbClient = PrismaClient | Prisma.TransactionClient;

type ImportRow = {
  collectionId: string;
  title: string;
  slug: string;
  authorId: string;
};

/** Импорт — не «сырая» вставка: запись получает ревизию v1 и activity. */
async function createImportedEntry(tx: Prisma.TransactionClient, data: ImportRow) {
  const entry = await tx.entry.create({ data });
  await tx.revision.create({
    data: {
      entryId: entry.id,
      version: 1,
      snapshotJson: buildEntrySnapshot(entry),
      changeNote: "Импорт из CSV",
      authorId: data.authorId,
    },
  });
  await tx.activityLog.create({
    data: {
      entryId: entry.id,
      userId: data.authorId,
      action: "CREATED",
      comment: `Импортирована запись «${entry.title}»`,
    },
  });
  return entry;
}

// Свободный slug с автосуффиксом (-2, -3, …): дубль названия не должен
// ронять создание P2002, а молча получать уникальный slug.
async function uniqueCollectionSlug(
  prisma: Pick<DbClient, "collection">,
  base: string,
): Promise<string> {
  const root = slugify(base) || "collection";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const exists = await prisma.collection.findUnique({ where: { slug: candidate } });
    if (!exists) return candidate;
  }
  throw new TRPCError({ code: "CONFLICT", message: "Не удалось подобрать свободный slug" });
}

export const collectionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(1000).optional() }).optional())
    .query(({ ctx, input }) =>
      ctx.prisma.collection.findMany({
        include: { _count: { select: { entries: true } } },
        orderBy: { createdAt: "asc" },
        take: input?.limit ?? 500,
      }),
    ),
  get: protectedProcedure.input(z.object({ slug: z.string() })).query(({ ctx, input }) =>
    ctx.prisma.collection.findUnique({
      where: { slug: input.slug },
      include: { entries: { take: 50, orderBy: { updatedAt: "desc" } } },
    }),
  ),
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        slug: z.string().max(150).optional(),
        description: z.string().max(2000).optional(),
        icon: z.string().max(50).default("FileText"),
        schemaJson: z.string().max(200_000).default("[]"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Retry on P2002 like entry.create: recompute a free slug and retry.
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const slug = input.slug
            ? await uniqueCollectionSlug(ctx.prisma, input.slug)
            : await uniqueCollectionSlug(ctx.prisma, input.name);
          return await ctx.prisma.collection.create({
            data: {
              name: input.name,
              slug,
              description: input.description,
              icon: input.icon,
              schemaJson: input.schemaJson,
            },
          });
        } catch (e) {
          if ((e as { code?: string }).code === 'P2002' && attempt < 4) {
            lastError = e;
            continue;
          }
          throw e;
        }
      }
      throw lastError;
    }),
  update: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1).max(200).optional(), description: z.string().max(2000).optional(), schemaJson: z.string().max(200_000).optional() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.collection.update({ where: { id: input.id }, data: { name: input.name, description: input.description, schemaJson: input.schemaJson } }),
    ),
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.prisma.collection.delete({ where: { id: input.id } }),
  ),

  // Экспорт записей коллекции в CSV (RFC 4180). Возвращает строку CSV.
  exportCsv: protectedProcedure
    .input(
      z.object({
        collectionId: z.string(),
        status: EntryStatus.optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.prisma.entry.findMany({
        where: {
          collectionId: input.collectionId,
          status: input.status,
          ...(input.search
            ? { OR: [{ title: { contains: input.search } }, { slug: { contains: input.search } }] }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 10_000,
      });
      return toCsv(
        entries.map((e) => ({
          title: sanitizeCsvCell(e.title),
          slug: e.slug,
          status: e.status,
          updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
        })),
        ["title", "slug", "status", "updatedAt"],
      );
    }),

  // Импорт записей из CSV-строки. Строки без title и дубли slug пропускаются.
  importCsv: editorProcedure
    .input(z.object({ collectionId: z.string(), csv: z.string().max(5_000_000), authorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rows = parseCsv(input.csv);
      if (!rows.length) return { imported: 0, skipped: 0 };
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = header.includes("title") || header.includes("slug");
      const body = hasHeader ? rows.slice(1) : rows;
      const ti = hasHeader ? header.indexOf("title") : 0;
      const si = hasHeader ? header.indexOf("slug") : 1;
      // authorId приходит от клиента: несуществующий автор — это 404,
      // а не P2003/500 на вставке.
      if (input.authorId) {
        const author = await ctx.prisma.user.findUnique({
          where: { id: input.authorId },
          select: { id: true },
        });
        if (!author) throw new TRPCError({ code: "NOT_FOUND", message: "Автор не найден" });
      }
      const existing = await ctx.prisma.entry.findMany({
        where: { collectionId: input.collectionId },
        select: { slug: true },
      });
      const seen = new Set(existing.map((e) => e.slug));
      const authorId = input.authorId ?? ctx.user.id;
      const data: ImportRow[] = [];
      let skipped = 0;
      for (const row of body) {
        const title = (row[ti] ?? "").trim();
        if (!title) {
          skipped += 1;
          continue;
        }
        const rawSlug = si >= 0 ? (row[si] ?? "").trim() : "";
        const slug = slugify(rawSlug || title);
        if (!slug || seen.has(slug)) {
          skipped += 1;
          continue;
        }
        seen.add(slug);
        data.push({ collectionId: input.collectionId, title, slug, authorId });
      }
      if (data.length) {
        try {
          await ctx.prisma.$transaction(async (tx) => {
            for (const d of data) await createImportedEntry(tx, d);
          });
          return { imported: data.length, skipped, conflicts: 0 };
        } catch (e) {
          // Гонка параллельных импортов: P2002 на дубле slug.
          // Добиваем построчно с точным учётом; прочие ошибки не глотаем.
          if ((e as { code?: string }).code !== "P2002") throw e;
          let imported = 0;
          let conflicts = 0;
          for (const d of data) {
            try {
              await ctx.prisma.$transaction(async (tx) => {
                await createImportedEntry(tx, d);
              });
              imported++;
            } catch (rowError) {
              if ((rowError as { code?: string }).code !== "P2002") throw rowError;
              conflicts++;
            }
          }
          return { imported, skipped, conflicts };
        }
      }
      return { imported: 0, skipped, conflicts: 0 };
    }),
});

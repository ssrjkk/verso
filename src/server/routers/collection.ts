import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, editorProcedure, adminProcedure } from "../trpc";
import { slugify } from "@/lib/slug";
import { toCsv, parseCsv, sanitizeCsvCell } from "@/lib/csv";
import { EntryStatus } from "@/lib/entry-status";
import { buildEntrySnapshot } from "@/lib/entry-snapshot";
import {
  checkCollectionSchema,
  collectionSchemaSchema,
  parseCollectionSchema,
  parseFieldValues,
  serializeCollectionSchema,
  validateEntryFieldValues,
  type CollectionField,
} from "@/lib/collection-schema";

type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Единая точка входа схемы: structured `fields` для UI, `schemaJson` для
 * совместимости и Headless-клиентов. Оба варианта проходят одну проверку,
 * поэтому в БД никогда не попадает половина валидной схемы.
 */
function resolveSchemaJson(input: {
  fields?: CollectionField[];
  schemaJson?: string;
}): string | undefined {
  if (input.fields !== undefined && input.schemaJson !== undefined) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Передайте либо fields, либо schemaJson, но не оба",
    });
  }
  if (input.fields !== undefined) return serializeCollectionSchema(input.fields);
  if (input.schemaJson !== undefined) {
    const checked = checkCollectionSchema(input.schemaJson);
    if (!checked.ok) throw new TRPCError({ code: "BAD_REQUEST", message: checked.message });
    return checked.json;
  }
  return undefined;
}

type ImportRow = {
  collectionId: string;
  title: string;
  slug: string;
  authorId: string;
  fieldsJson?: string;
};

const CSV_BASE_COLUMNS = ["title", "slug", "status", "updatedAt"] as const;
const CSV_BASE_HEADERS = new Set(CSV_BASE_COLUMNS.map((column) => column.toLowerCase()));

function csvFieldValue(value: unknown): unknown {
  if (value === undefined || value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function parseCsvCheckbox(raw: string): boolean | undefined {
  const value = raw.trim().toLowerCase();
  if (["true", "1", "yes", "да"].includes(value)) return true;
  if (["false", "0", "no", "нет"].includes(value)) return false;
  return undefined;
}

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
        // Структурированный ввод для UI; schemaJson остаётся для
        // совместимости и интеграций.
        fields: collectionSchemaSchema.optional(),
        schemaJson: z.string().max(200_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const schemaJson = resolveSchemaJson(input) ?? "[]";
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
              schemaJson,
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
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
        fields: collectionSchemaSchema.optional(),
        schemaJson: z.string().max(200_000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const schemaJson = resolveSchemaJson(input);
      return ctx.prisma.collection.update({
        where: { id: input.id },
        data: { name: input.name, description: input.description, schemaJson },
      });
    }),
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
      const collection = await ctx.prisma.collection.findUnique({
        where: { id: input.collectionId },
        select: { schemaJson: true },
      });
      const schema = parseCollectionSchema(collection?.schemaJson);
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
      // Колонки схемы идут после системных: заголовки — стабильные ключи
      // API, поэтому экспорт остаётся машинно-читаемым и переимпортируемым.
      const columns = [...CSV_BASE_COLUMNS, ...schema.map((field) => field.key)];
      return toCsv(
        entries.map((e) => {
          const values = parseFieldValues(e.fieldsJson);
          const row: Record<string, unknown> = {
            title: sanitizeCsvCell(e.title),
            slug: e.slug,
            status: e.status,
            updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
          };
          for (const field of schema) {
            row[field.key] = sanitizeCsvCell(csvFieldValue(values[field.key]));
          }
          return row;
        }),
        columns,
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

      const collection = header.some((column) => !CSV_BASE_HEADERS.has(column))
        ? await ctx.prisma.collection.findUnique({
            where: { id: input.collectionId },
            select: { schemaJson: true },
          })
        : null;
      const schema = parseCollectionSchema(collection?.schemaJson);
      // Колонки схемы ищем по ключу или человекочитаемому названию: экспорт
      // пишет ключи, а файл из Excel может содержать заголовки-лейблы.
      const fieldColumns = hasHeader
        ? schema.flatMap((field) => {
            const label = field.label.trim().toLowerCase();
            const index = header.indexOf(field.key);
            const byLabel = index >= 0 ? index : header.indexOf(label);
            return byLabel >= 0 ? [{ field, index: byLabel }] : [];
          })
        : [];
      const hasCustomColumns = fieldColumns.length > 0;

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
      let invalid = 0;
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

        let fieldsJson: string | undefined;
        if (hasCustomColumns) {
          const values: Record<string, unknown> = {};
          let checkboxBroken = false;
          for (const { field, index } of fieldColumns) {
            const raw = (row[index] ?? "").trim();
            if (raw === "") continue;
            if (field.type === "checkbox") {
              const parsed = parseCsvCheckbox(raw);
              if (parsed === undefined) {
                checkboxBroken = true;
                break;
              }
              values[field.key] = parsed;
            } else {
              values[field.key] = raw;
            }
          }
          const checked = checkboxBroken
            ? ({ ok: false } as const)
            : validateEntryFieldValues(schema, JSON.stringify(values));
          if (!checked.ok) {
            invalid += 1;
            continue;
          }
          if (checked.json !== "{}") fieldsJson = checked.json;
        }

        seen.add(slug);
        data.push({
          collectionId: input.collectionId,
          title,
          slug,
          authorId,
          ...(fieldsJson ? { fieldsJson } : {}),
        });
      }
      const withInvalid = <T extends { imported: number; skipped: number; conflicts: number }>(
        result: T,
      ) => (invalid > 0 ? { ...result, invalid } : result);
      if (data.length) {
        try {
          await ctx.prisma.$transaction(async (tx) => {
            for (const d of data) await createImportedEntry(tx, d);
          });
          return withInvalid({ imported: data.length, skipped, conflicts: 0 });
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
          return withInvalid({ imported, skipped, conflicts });
        }
      }
      return withInvalid({ imported: 0, skipped, conflicts: 0 });
    }),
});

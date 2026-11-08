import { z } from "zod";
import { createTRPCRouter, protectedProcedure, editorProcedure, adminProcedure } from "../trpc";
import { slugify } from "@/lib/slug";
import { toCsv, parseCsv } from "@/lib/csv";

export const collectionRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.collection.findMany({
      include: { _count: { select: { entries: true } } },
      orderBy: { createdAt: "asc" },
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
        name: z.string().min(1),
        slug: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().default("FileText"),
        schemaJson: z.string().default("[]"),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.prisma.collection.create({
        data: {
          name: input.name,
          slug: input.slug ? slugify(input.slug) : slugify(input.name),
          description: input.description,
          icon: input.icon,
          schemaJson: input.schemaJson,
        },
      }),
    ),
  update: adminProcedure
    .input(z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional(), schemaJson: z.string().optional() }))
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
        status: z.enum(["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(),
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
      });
      return toCsv(
        entries.map((e) => ({
          title: e.title,
          slug: e.slug,
          status: e.status,
          updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
        })),
        ["title", "slug", "status", "updatedAt"],
      );
    }),

  // Импорт записей из CSV-строки. Строки без title и дубли slug пропускаются.
  importCsv: editorProcedure
    .input(z.object({ collectionId: z.string(), csv: z.string(), authorId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const rows = parseCsv(input.csv);
      if (!rows.length) return { imported: 0, skipped: 0 };
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const hasHeader = header.includes("title") || header.includes("slug");
      const body = hasHeader ? rows.slice(1) : rows;
      const ti = hasHeader ? header.indexOf("title") : 0;
      const si = hasHeader ? header.indexOf("slug") : 1;
      const existing = await ctx.prisma.entry.findMany({
        where: { collectionId: input.collectionId },
        select: { slug: true },
      });
      const seen = new Set(existing.map((e) => e.slug));
      const authorId = input.authorId ?? ctx.user.id;
      const data: { collectionId: string; title: string; slug: string; authorId: string }[] = [];
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
          const r = await ctx.prisma.entry.createMany({ data });
          return { imported: r.count, skipped, conflicts: 0 };
        } catch (e) {
          // Гонка параллельных импортов: P2002 на дубле slug.
          // Добиваем построчно с точным учётом, чужое не глотаем.
          if ((e as { code?: string }).code !== "P2002") throw e;
          let imported = 0;
          let skipped2 = skipped;
          for (const d of data) {
            try {
              await ctx.prisma.entry.create({ data: d });
              imported++;
            } catch {
              skipped2++;
            }
          }
          return { imported, skipped: skipped2, conflicts: data.length - imported };
        }
      }
      return { imported: 0, skipped, conflicts: 0 };
    }),
});

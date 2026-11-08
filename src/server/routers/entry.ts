import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, editorProcedure } from "../trpc";
import { slugify } from "@/lib/slug";
import { fireWebhooks } from "@/lib/webhook";

const Status = z.enum(["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);

// Свободный slug внутри коллекции: дубль названия получает -2, -3, …,
// Free slug within a collection: duplicates get -2, -3, ... instead of P2002.
// Residual races are retried by the caller (see entry.create retry loop).
async function uniqueEntrySlug(
  prisma: {
    entry: { findUnique: (a: unknown) => Promise<unknown> };
  },
  collectionId: string,
  base: string,
): Promise<string> {
  const root = slugify(base) || "entry";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const exists = await prisma.entry.findUnique({
      where: { collectionId_slug: { collectionId, slug: candidate } },
    });
    if (!exists) return candidate;
  }
  throw new TRPCError({ code: "CONFLICT", message: "Не удалось подобрать свободный slug" });
}

export const entryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        collectionId: z.string().optional(),
        status: Status.optional(),
        tagId: z.string().optional(),
        search: z.string().optional(),
        // Пагинационный колпак против JSON-бомб: дефолт 200, жёсткий потолок 1000.
        // Календарю нужны все записи — он передаёт limit явно.
        limit: z.number().int().min(1).max(1000).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.entry.findMany({
        where: {
          collectionId: input.collectionId,
          status: input.status,
          ...(input.tagId ? { tags: { some: { tagId: input.tagId } } } : {}),
          ...(input.search
            ? { OR: [{ title: { contains: input.search } }, { slug: { contains: input.search } }] }
            : {}),
        },
        include: {
          collection: true,
          stage: true,
          tags: { include: { tag: true } },
          author: { select: { id: true, name: true, email: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: input.limit ?? 200,
      });
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) =>
    ctx.prisma.entry.findUnique({
      where: { id: input.id },
      include: {
        collection: true,
        stage: true,
        blocks: { orderBy: { order: "asc" } },
        tags: { include: { tag: true } },
        revisions: { orderBy: { version: "desc" }, take: 20 },
        author: { select: { id: true, name: true } },
      },
    }),
  ),

  create: editorProcedure
    .input(
      z.object({
        collectionId: z.string(),
        title: z.string().min(1).max(300),
        slug: z.string().max(150).optional(),
        excerpt: z.string().max(5000).optional(),
        fieldsJson: z.string().max(200_000).default("{}"),
        stageId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const base = input.slug ? slugify(input.slug) : slugify(input.title);
      const collection = await ctx.prisma.collection.findUnique({ where: { id: input.collectionId }, select: { id: true } });
      if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Коллекция не найдена" });
      if (input.stageId) {
        const stage = await ctx.prisma.workflowStage.findUnique({ where: { id: input.stageId }, select: { id: true } });
        if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Этап не найден" });
      }
      // Retry on P2002: two parallel creates may pick the same free slug
      // before either commits; the loser recomputes and retries (max 5).
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await ctx.prisma.$transaction(async (tx) => {
        const finalSlug = await uniqueEntrySlug(tx as never, input.collectionId, base);
        const entry = await tx.entry.create({
          data: {
            collectionId: input.collectionId,
            title: input.title,
            slug: finalSlug,
            excerpt: input.excerpt,
            fieldsJson: input.fieldsJson,
            stageId: input.stageId,
            authorId: ctx.user.id,
          },
        });
        await tx.revision.create({
          data: {
            entryId: entry.id,
            version: 1,
            snapshotJson: JSON.stringify({ entry, blocks: [] }),
            changeNote: "Первоначальное создание",
            authorId: ctx.user.id,
          },
        });
        await tx.activityLog.create({
          data: { entryId: entry.id, userId: ctx.user.id, action: "CREATED", comment: `Создана запись «${entry.title}»` },
        });
        return entry;
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

  update: editorProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(300).optional(),
        slug: z.string().max(150).optional(),
        excerpt: z.string().max(5000).optional(),
        status: Status.optional(),
        fieldsJson: z.string().max(200_000).optional(),
        seoTitle: z.string().max(200).optional(),
        seoDescription: z.string().max(500).optional(),
        scheduledFor: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: "Некорректная дата" }).optional(),
        changeNote: z.string().max(1000).optional(),
        // Оптимистичная блокировка: UI присылает updatedAt прочитанной версии.
        // Расхождение = кто-то сохранился раньше -> CONFLICT вместо тихой потери правок.
        expectedUpdatedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, changeNote, scheduledFor, expectedUpdatedAt, ...rest } = input;
      return ctx.prisma.$transaction(async (tx) => {
        // Base row for FK-free checks below (collection scope + optimistic lock).
        const current = await tx.entry.findUnique({
          where: { id },
          select: { updatedAt: true, collectionId: true, slug: true },
        });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
        if (expectedUpdatedAt) {
          if (new Date(current.updatedAt).getTime() !== new Date(expectedUpdatedAt).getTime()) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Запись изменена другим пользователем. Обновите страницу и повторите.",
            });
          }
        }
        const data: Record<string, unknown> = { ...rest };
        if (rest.slug) {
          // Свой slug не трогаем; чужой занятый получает суффикс -2, -3, ...
          const base = slugify(rest.slug) || current.slug;
          let candidate = base;
          for (let i = 0; i < 100; i++) {
            const clash = await tx.entry.findUnique({
              where: { collectionId_slug: { collectionId: current.collectionId, slug: candidate } },
              select: { id: true },
            });
            if (!clash || (clash as { id: string }).id === id) break;
            candidate = `${base}-${i + 2}`;
          }
          data.slug = candidate;
        }
        if (scheduledFor) data.scheduledFor = new Date(scheduledFor);
        const updated = await tx.entry.update({ where: { id }, data: data as never, include: { blocks: true } });
        const count = await tx.revision.count({ where: { entryId: id } });
        await tx.revision.create({
          data: {
            entryId: id,
            version: count + 1,
            snapshotJson: JSON.stringify({ entry: updated, blocks: (updated as { blocks: unknown }).blocks }),
            changeNote: changeNote ?? "Обновление",
            authorId: ctx.user.id,
          },
        });
        return updated;
      }).then((updated) => {
        // Сеть — только после коммита и без ожидания: публикация не блокируется.
        const status = (updated as { status: string }).status;
        fireWebhooks(
          ctx.prisma,
          status === "PUBLISHED" ? "entry.published" : "entry.updated",
          updated,
        );
        return updated;
      });
    }),

  // Перетаскивание карточки на Kanban-доске редполитики (dnd-kit)
  moveStage: editorProcedure
    .input(z.object({ entryId: z.string(), stageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.prisma.workflowStage.findUnique({ where: { id: input.stageId } });
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Этап не найден" });
      const existing = await ctx.prisma.entry.findUnique({ where: { id: input.entryId }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
      const isPublishing = stage.targetState === "PUBLISHED";
      const entry = await ctx.prisma.$transaction(async (tx) => {
        const e = await tx.entry.update({
          where: { id: input.entryId },
          data: {
            stageId: stage.id,
            status: stage.targetState,
            publishedAt: isPublishing ? new Date() : undefined,
          },
        });
        await tx.activityLog.create({
          data: { entryId: e.id, userId: ctx.user.id, action: "STAGE_CHANGED", comment: `Этап → ${stage.name}` },
        });
        return e;
      });
      // Сеть — только после коммита: не держим транзакцию на HTTP.
      if (isPublishing) fireWebhooks(ctx.prisma, "entry.published", entry);
      return entry;
    }),

  // Откат к любой предыдущей ревизии в 1 клик
  restoreRevision: editorProcedure
    .input(z.object({ entryId: z.string(), revisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rev = await ctx.prisma.revision.findUnique({ where: { id: input.revisionId } });
      if (!rev || rev.entryId !== input.entryId) throw new TRPCError({ code: "NOT_FOUND", message: "Ревизия не найдена" });
      const snap = JSON.parse(rev.snapshotJson) as { entry: { title: string; fieldsJson: string; slug: string }; blocks: { type: string; order: number; propsJson: string }[] };
      return ctx.prisma.$transaction(async (tx) => {
        const entry = await tx.entry.update({
          where: { id: input.entryId },
          data: { title: snap.entry.title, fieldsJson: snap.entry.fieldsJson, slug: snap.entry.slug },
        });
        await tx.pageBlock.deleteMany({ where: { entryId: input.entryId } });
        if (snap.blocks?.length) {
          await tx.pageBlock.createMany({
            data: snap.blocks.map((b) => ({ entryId: input.entryId, type: b.type, order: b.order, propsJson: b.propsJson })),
          });
        }
        const count = await tx.revision.count({ where: { entryId: input.entryId } });
        await tx.revision.create({
          data: { entryId: input.entryId, version: count + 1, snapshotJson: rev.snapshotJson, changeNote: `Откат к v${rev.version}`, authorId: ctx.user.id },
        });
        await tx.activityLog.create({
          data: { entryId: input.entryId, userId: ctx.user.id, action: "RESTORED_REVISION", comment: `Откат к версии ${rev.version}` },
        });
        return entry;
      });
    }),

  publish: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.entry.findUnique({ where: { id: input.id }, select: { id: true } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
    const entry = await ctx.prisma.entry.update({
      where: { id: input.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    fireWebhooks(ctx.prisma, "entry.published", entry);
    return entry;
  }),

  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.prisma.entry.delete({ where: { id: input.id } });
    return { ok: true };
  }),

  // Перезапись тегов записи: upsert по имени + пересоздание связей EntryTag.
  setTags: editorProcedure
    .input(z.object({ entryId: z.string(), tags: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const names = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
      for (const name of names) {
        await ctx.prisma.tag.upsert({ where: { name }, create: { name }, update: {} });
      }
      await ctx.prisma.entryTag.deleteMany({ where: { entryId: input.entryId } });
      if (names.length) {
        const tags = await ctx.prisma.tag.findMany({ where: { name: { in: names } } });
        await ctx.prisma.entryTag.createMany({
          data: tags.map((t) => ({ entryId: input.entryId, tagId: t.id })),
        });
      }
      return ctx.prisma.entry.findUnique({
        where: { id: input.entryId },
        include: { tags: { include: { tag: true } } },
      });
    }),

  // Лента активности записи (последние 50 событий).
  listActivity: protectedProcedure
    .input(z.object({ entryId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.activityLog.findMany({
        where: { entryId: input.entryId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true } } },
      }),
    ),

  addActivity: editorProcedure
    .input(z.object({ entryId: z.string(), action: z.string().min(1), comment: z.string().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.activityLog.create({
        data: { entryId: input.entryId, userId: ctx.user.id, action: input.action, comment: input.comment },
      }),
    ),
});

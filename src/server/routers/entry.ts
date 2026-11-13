import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure, editorProcedure } from "../trpc";
import { slugify } from "@/lib/slug";
import { fireWebhooks } from "@/lib/webhook";
import { EntryStatus, isEntryStatus } from "@/lib/entry-status";
import { buildEntrySnapshot, parseEntrySnapshot } from "@/lib/entry-snapshot";

type DbClient = PrismaClient | Prisma.TransactionClient;

// Свободный slug внутри коллекции: дубль названия получает -2, -3, …,
// Free slug within a collection: duplicates get -2, -3, ... instead of P2002.
// Residual races are retried by the caller (see entry.create retry loop).
async function uniqueEntrySlug(
  prisma: Pick<DbClient, "entry">,
  collectionId: string,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base) || "entry";
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const exists = await prisma.entry.findUnique({
      where: { collectionId_slug: { collectionId, slug: candidate } },
      select: { id: true },
    });
    if (!exists || (excludeId !== undefined && exists.id === excludeId)) return candidate;
  }
  throw new TRPCError({ code: "CONFLICT", message: "Не удалось подобрать свободный slug" });
}

export const entryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        collectionId: z.string().optional(),
        status: EntryStatus.optional(),
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
        const finalSlug = await uniqueEntrySlug(tx, input.collectionId, base);
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
            snapshotJson: buildEntrySnapshot(entry),
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
        status: EntryStatus.optional(),
        fieldsJson: z.string().max(200_000).optional(),
        seoTitle: z.string().max(200).optional(),
        seoDescription: z.string().max(500).optional(),
        // null — явное снятие расписания; undefined — «не трогать».
        scheduledFor: z
          .string()
          .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Некорректная дата" })
          .nullable()
          .optional(),
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
          select: {
            updatedAt: true,
            collectionId: true,
            slug: true,
            status: true,
            publishedAt: true,
          },
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
        // Поведение идентично прежнему `{ ...rest }`: копируем только поля ввода
        // (scheduledFor/expectedUpdatedAt вынесены), slug/ scheduledFor обрабатываются ниже.
        const data = { ...rest } as Prisma.EntryUpdateInput;
        if (rest.slug) {
          // Свой slug не трогаем; чужой занятый получает суффикс -2, -3, ...
          data.slug = await uniqueEntrySlug(
            tx,
            current.collectionId,
            slugify(rest.slug) || current.slug,
            id,
          );
        }
        if (scheduledFor !== undefined) {
          data.scheduledFor = scheduledFor === null ? null : new Date(scheduledFor);
        }
        // Публикация через update — тот же инвариант, что и entry.publish:
        // у PUBLISHED всегда есть publishedAt; повторное сохранение дату не сдвигает.
        if (rest.status === "PUBLISHED") {
          data.publishedAt = current.publishedAt ?? new Date();
        }
        const updated = await tx.entry.update({
          where: { id },
          data,
          include: { blocks: true, tags: { include: { tag: true } } },
        });
        const count = await tx.revision.count({ where: { entryId: id } });
        await tx.revision.create({
          data: {
            entryId: id,
            version: count + 1,
            snapshotJson: buildEntrySnapshot(
              updated,
              updated.blocks ?? [],
              (updated.tags ?? []).flatMap((t) => (t.tag?.name ? [t.tag.name] : [])),
            ),
            changeNote: changeNote ?? "Обновление",
            authorId: ctx.user.id,
          },
        });
        return { updated, wasPublished: current.status === "PUBLISHED" };
      }).then(({ updated, wasPublished }) => {
        // Сеть — только после коммита и без ожидания: публикация не блокируется.
        // entry.published — только на переходе в PUBLISHED, правки живой
        // публикации идут как entry.updated (без дублей события публикации).
        fireWebhooks(
          ctx.prisma,
          updated.status === "PUBLISHED" && !wasPublished
            ? "entry.published"
            : "entry.updated",
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
      if (!isEntryStatus(stage.targetState)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Некорректный статус этапа" });
      }
      const existing = await ctx.prisma.entry.findUnique({
        where: { id: input.entryId },
        select: { id: true, status: true, publishedAt: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
      // Переход в публикацию, а не «уже опубликована»: повторный дроп
      // на тот же этап не двигает publishedAt и не дублирует вебхук.
      const isPublishing = stage.targetState === "PUBLISHED" && existing.status !== "PUBLISHED";
      const entry = await ctx.prisma.$transaction(async (tx) => {
        const e = await tx.entry.update({
          where: { id: input.entryId },
          data: {
            stageId: stage.id,
            status: stage.targetState,
            publishedAt: isPublishing ? (existing.publishedAt ?? new Date()) : undefined,
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
      const snap = parseEntrySnapshot(rev.snapshotJson);
      const snapEntry = snap.entry;
      return ctx.prisma.$transaction(async (tx) => {
        const current = await tx.entry.findUnique({
          where: { id: input.entryId },
          select: { collectionId: true, slug: true },
        });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });

        // Восстанавливаем весь скалярный снимок, а не три поля: SEO, статус,
        // даты и этап тоже часть ревизии. id/collectionId/authorId не трогаем.
        const data: Prisma.EntryUncheckedUpdateInput = {};
        if (typeof snapEntry.title === "string") data.title = snapEntry.title;
        if (typeof snapEntry.excerpt === "string" || snapEntry.excerpt === null) {
          data.excerpt = snapEntry.excerpt;
        }
        if (typeof snapEntry.fieldsJson === "string") data.fieldsJson = snapEntry.fieldsJson;
        if (typeof snapEntry.seoTitle === "string" || snapEntry.seoTitle === null) {
          data.seoTitle = snapEntry.seoTitle;
        }
        if (typeof snapEntry.seoDescription === "string" || snapEntry.seoDescription === null) {
          data.seoDescription = snapEntry.seoDescription;
        }
        if (typeof snapEntry.ogImageUrl === "string" || snapEntry.ogImageUrl === null) {
          data.ogImageUrl = snapEntry.ogImageUrl;
        }
        if (typeof snapEntry.canonicalUrl === "string" || snapEntry.canonicalUrl === null) {
          data.canonicalUrl = snapEntry.canonicalUrl;
        }
        if (typeof snapEntry.noIndex === "boolean") data.noIndex = snapEntry.noIndex;
        if (isEntryStatus(snapEntry.status)) data.status = snapEntry.status;
        if (typeof snapEntry.slug === "string" && snapEntry.slug) {
          data.slug = await uniqueEntrySlug(
            tx,
            current.collectionId,
            snapEntry.slug,
            input.entryId,
          );
        }
        if (typeof snapEntry.stageId === "string") {
          const stage = await tx.workflowStage.findUnique({
            where: { id: snapEntry.stageId },
            select: { id: true },
          });
          // Удалённый этап не должен ронять откат: просто оставляем текущий.
          if (stage) data.stageId = stage.id;
        } else if (snapEntry.stageId === null) {
          data.stageId = null;
        }
        if (snapEntry.scheduledFor === null) data.scheduledFor = null;
        else if (typeof snapEntry.scheduledFor === "string") {
          const date = new Date(snapEntry.scheduledFor);
          if (!Number.isNaN(date.getTime())) data.scheduledFor = date;
        }
        if (snapEntry.publishedAt === null) data.publishedAt = null;
        else if (typeof snapEntry.publishedAt === "string") {
          const date = new Date(snapEntry.publishedAt);
          if (!Number.isNaN(date.getTime())) data.publishedAt = date;
        }

        const entry = await tx.entry.update({ where: { id: input.entryId }, data });
        await tx.pageBlock.deleteMany({ where: { entryId: input.entryId } });
        if (snap.blocks.length) {
          await tx.pageBlock.createMany({
            data: snap.blocks.map((b) => ({
              entryId: input.entryId,
              type: typeof b.type === "string" ? b.type : "RICH_TEXT",
              order: typeof b.order === "number" ? b.order : 0,
              isVisible: typeof b.isVisible === "boolean" ? b.isVisible : true,
              propsJson: typeof b.propsJson === "string" ? b.propsJson : "{}",
            })),
          });
        }
        // Теги появились в снапшотах позже: старые ревизии их не содержат
        // и не должны молча стирать текущие связи.
        if (snap.tags) {
          const names = [...new Set(snap.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 20);
          for (const name of names) {
            await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
          }
          await tx.entryTag.deleteMany({ where: { entryId: input.entryId } });
          if (names.length) {
            const tags = await tx.tag.findMany({ where: { name: { in: names } } });
            if (tags.length) {
              await tx.entryTag.createMany({
                data: tags.map((t) => ({ entryId: input.entryId, tagId: t.id })),
              });
            }
          }
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
    const result = await ctx.prisma.$transaction(async (tx) => {
      const current = await tx.entry.findUnique({
        where: { id: input.id },
        include: { blocks: true, tags: { include: { tag: true } } },
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
      // Идемпотентность: повторная публикация не двигает дату, не плодит
      // ревизии/activity и не рассылает второй entry.published.
      if (current.status === "PUBLISHED") return { entry: current, changed: false };

      const entry = await tx.entry.update({
        where: { id: input.id },
        data: { status: "PUBLISHED", publishedAt: current.publishedAt ?? new Date() },
        include: { blocks: true, tags: { include: { tag: true } } },
      });
      const count = await tx.revision.count({ where: { entryId: entry.id } });
      await tx.revision.create({
        data: {
          entryId: entry.id,
          version: count + 1,
          snapshotJson: buildEntrySnapshot(
            entry,
            entry.blocks ?? [],
            (entry.tags ?? []).flatMap((t) => (t.tag?.name ? [t.tag.name] : [])),
          ),
          changeNote: "Публикация",
          authorId: ctx.user.id,
        },
      });
      await tx.activityLog.create({
        data: {
          entryId: entry.id,
          userId: ctx.user.id,
          action: "PUBLISHED",
          comment: "Запись опубликована",
        },
      });
      return { entry, changed: true };
    });
    // Сеть — только после коммита.
    if (result.changed) fireWebhooks(ctx.prisma, "entry.published", result.entry);
    return result.entry;
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
      // Upsert тегов + пересоздание связей — атомарно: сбой посередине
      // не оставит запись с частичным набором тегов. Ревизия/activity/webhook
      // создаются только при фактическом изменении набора: EntryForm вызывает
      // setTags после каждого сохранения, и «пустой» вызов не должен плодить
      // шум в истории и дублировать entry.updated.
      const result = await ctx.prisma.$transaction(async (tx) => {
        const current = await tx.entry.findUnique({
          where: { id: input.entryId },
          include: { tags: { include: { tag: true } } },
        });
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });
        const before = new Set(
          (current.tags ?? []).flatMap((t) => (t.tag?.name ? [t.tag.name] : [])),
        );
        const changed = before.size !== names.length || names.some((name) => !before.has(name));

        for (const name of names) {
          await tx.tag.upsert({ where: { name }, create: { name }, update: {} });
        }
        await tx.entryTag.deleteMany({ where: { entryId: input.entryId } });
        if (names.length) {
          const tags = await tx.tag.findMany({ where: { name: { in: names } } });
          await tx.entryTag.createMany({
            data: tags.map((t) => ({ entryId: input.entryId, tagId: t.id })),
          });
        }
        const updated = await tx.entry.findUnique({
          where: { id: input.entryId },
          include: {
            blocks: { orderBy: { order: "asc" } },
            tags: { include: { tag: true } },
          },
        });
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Запись не найдена" });

        if (changed) {
          const count = await tx.revision.count({ where: { entryId: input.entryId } });
          await tx.revision.create({
            data: {
              entryId: input.entryId,
              version: count + 1,
              snapshotJson: buildEntrySnapshot(
                updated,
                updated.blocks ?? [],
                (updated.tags ?? []).flatMap((t) => (t.tag?.name ? [t.tag.name] : [])),
              ),
              changeNote: "Изменение тегов",
              authorId: ctx.user.id,
            },
          });
          await tx.activityLog.create({
            data: {
              entryId: input.entryId,
              userId: ctx.user.id,
              action: "TAGS_CHANGED",
              comment: names.length ? names.join(", ") : "Теги очищены",
            },
          });
        }
        return { updated, changed };
      });
      if (result.changed) fireWebhooks(ctx.prisma, "entry.updated", result.updated);
      return result.updated;
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

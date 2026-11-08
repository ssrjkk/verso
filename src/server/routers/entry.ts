import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, editorProcedure } from "../trpc";
import { slugify } from "@/lib/slug";

const Status = z.enum(["DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]);

async function fireWebhooks(prisma: { webhookEndpoint: { findMany: (a: unknown) => Promise<{ url: string; secret: string; events: string; isActive: boolean }[]> } }, event: string, payload: unknown) {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { isActive: true } } as never);
    const targets = endpoints.filter((e) => e.events.split(",").map((s) => s.trim()).includes(event));
    await Promise.allSettled(
      targets.map((e) =>
        fetch(e.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Verso-Event": event, "X-Verso-Sign": e.secret },
          body: JSON.stringify({ event, data: payload }),
        }),
      ),
    );
  } catch {
    // вебхуки не должны ронять публикацию
  }
}

export const entryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        collectionId: z.string().optional(),
        status: Status.optional(),
        tagId: z.string().optional(),
        search: z.string().optional(),
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
        title: z.string().min(1),
        slug: z.string().optional(),
        excerpt: z.string().optional(),
        fieldsJson: z.string().default("{}"),
        stageId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const finalSlug = input.slug ? slugify(input.slug) : slugify(input.title);
      return ctx.prisma.$transaction(async (tx) => {
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
    }),

  update: editorProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        slug: z.string().optional(),
        excerpt: z.string().optional(),
        status: Status.optional(),
        fieldsJson: z.string().optional(),
        seoTitle: z.string().optional(),
        seoDescription: z.string().optional(),
        scheduledFor: z.string().optional(),
        changeNote: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, changeNote, scheduledFor, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (rest.slug) data.slug = slugify(rest.slug);
      if (scheduledFor) data.scheduledFor = new Date(scheduledFor);
      const updated = await ctx.prisma.entry.update({ where: { id }, data: data as never, include: { blocks: true } });
      const count = await ctx.prisma.revision.count({ where: { entryId: id } });
      await ctx.prisma.revision.create({
        data: {
          entryId: id,
          version: count + 1,
          snapshotJson: JSON.stringify({ entry: updated, blocks: (updated as { blocks: unknown }).blocks }),
          changeNote: changeNote ?? "Обновление",
          authorId: ctx.user.id,
        },
      });
      if ((updated as { status: string }).status === "PUBLISHED") {
        await fireWebhooks(ctx.prisma as never, "entry.published", updated);
      }
      return updated;
    }),

  // Перетаскивание карточки на Kanban-доске редполитики (dnd-kit)
  moveStage: editorProcedure
    .input(z.object({ entryId: z.string(), stageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const stage = await ctx.prisma.workflowStage.findUnique({ where: { id: input.stageId } });
      if (!stage) throw new TRPCError({ code: "NOT_FOUND", message: "Этап не найден" });
      const isPublishing = stage.targetState === "PUBLISHED";
      const entry = await ctx.prisma.entry.update({
        where: { id: input.entryId },
        data: {
          stageId: stage.id,
          status: stage.targetState,
          publishedAt: isPublishing ? new Date() : undefined,
        },
      });
      await ctx.prisma.activityLog.create({
        data: { entryId: entry.id, userId: ctx.user.id, action: "STAGE_CHANGED", comment: `Этап → ${stage.name}` },
      });
      if (isPublishing) await fireWebhooks(ctx.prisma as never, "entry.published", entry);
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
    const entry = await ctx.prisma.entry.update({
      where: { id: input.id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await fireWebhooks(ctx.prisma as never, "entry.published", entry);
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

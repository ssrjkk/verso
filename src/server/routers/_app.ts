import { createTRPCRouter } from "../trpc";
import { collectionRouter } from "./collection";
import { entryRouter } from "./entry";
import { blockRouter, workflowRouter, mediaRouter, seoRouter, apiKeyRouter, webhookRouter } from "./content";
import { z } from "zod";
import { protectedProcedure, editorProcedure } from "../trpc";
import { userRouter } from "./user";

const taskRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.editorialTask.findMany({ orderBy: { dueDate: "asc" }, include: { entry: true } }),
  ),
  create: editorProcedure
    .input(z.object({ title: z.string().min(1).max(300), description: z.string().max(5000).optional(), dueDate: z.string().optional(), entryId: z.string().optional(), priority: z.string().default("MEDIUM") }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.editorialTask.create({
        data: {
          title: input.title, description: input.description, priority: input.priority,
          entryId: input.entryId, dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          assigneeId: ctx.user.id,
        },
      }),
    ),
  toggle: editorProcedure.input(z.object({ id: z.string(), status: z.string() })).mutation(({ ctx, input }) =>
    ctx.prisma.editorialTask.update({ where: { id: input.id }, data: { status: input.status } }),
  ),
});

export const appRouter = createTRPCRouter({
  user: userRouter,
  collection: collectionRouter,
  entry: entryRouter,
  block: blockRouter,
  workflow: workflowRouter,
  media: mediaRouter,
  seo: seoRouter,
  apiKey: apiKeyRouter,
  webhook: webhookRouter,
  task: taskRouter,
});

export type AppRouter = typeof appRouter;

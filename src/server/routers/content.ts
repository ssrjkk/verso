import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, editorProcedure, adminProcedure } from "../trpc";
import { testWebhook, validateWebhookUrl } from "@/lib/webhook";

const WebhookUrl = z
  .string()
  .max(2048)
  .superRefine((value, ctx) => {
    const result = validateWebhookUrl(value);
    if (!result.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.reason });
  });

export const blockRouter = createTRPCRouter({
  list: protectedProcedure.input(z.object({ entryId: z.string() })).query(({ ctx, input }) =>
    ctx.prisma.pageBlock.findMany({ where: { entryId: input.entryId }, orderBy: { order: "asc" } }),
  ),
  upsertMany: editorProcedure
    .input(z.object({
      entryId: z.string(),
      blocks: z.array(z.object({
        id: z.string().optional(),
        type: z.enum(["HERO", "FEATURES", "PRICING", "FAQ", "RICH_TEXT", "GALLERY", "CODE", "CTA"]),
        order: z.number(),
        isVisible: z.boolean().default(true),
        propsJson: z.string().default("{}"),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.pageBlock.deleteMany({ where: { entryId: input.entryId } });
      await ctx.prisma.pageBlock.createMany({
        data: input.blocks.map((b) => ({
          entryId: input.entryId, type: b.type, order: b.order, isVisible: b.isVisible, propsJson: b.propsJson,
        })),
      });
      return ctx.prisma.pageBlock.findMany({ where: { entryId: input.entryId }, orderBy: { order: "asc" } });
    }),
  remove: editorProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.prisma.pageBlock.delete({ where: { id: input.id } }),
  ),
});

export const workflowRouter = createTRPCRouter({
  stages: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.workflowStage.findMany({ orderBy: { order: "asc" }, include: { entries: { include: { collection: true } } } }),
  ),
  createStage: adminProcedure
    .input(z.object({ name: z.string(), color: z.string().default("#f97316"), targetState: z.string().default("DRAFT") }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.prisma.workflowStage.count();
      return ctx.prisma.workflowStage.create({ data: { ...input, order: count } });
    }),
});

export const mediaRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({
      folder: z.string().optional(),
      search: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    }))
    .query(({ ctx, input }) =>
      ctx.prisma.mediaAsset.findMany({
        where: {
          ...(input.folder && input.folder !== "all" ? { folder: input.folder } : {}),
          ...(input.search ? { filename: { contains: input.search } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit ?? 200,
      }),
    ),
  create: editorProcedure
    .input(z.object({
      filename: z.string().min(1).max(500), url: z.string().max(2000), mimeType: z.string().max(100), sizeBytes: z.number().int().min(0),
      width: z.number().optional(), height: z.number().optional(), altText: z.string().max(500).default(""), folder: z.string().max(40).default("root"),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.mediaAsset.create({ data: input })),
  updateAlt: editorProcedure
    .input(z.object({ id: z.string(), altText: z.string() }))
    .mutation(({ ctx, input }) => ctx.prisma.mediaAsset.update({ where: { id: input.id }, data: { altText: input.altText } })),
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const asset = await ctx.prisma.mediaAsset.findUnique({ where: { id: input.id } });
    if (!asset) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Файл не найден" });
    }
    await ctx.prisma.mediaAsset.delete({ where: { id: input.id } });
    // Удаляем физический файл, чтобы не копились сироты в public/uploads.
    try {
      const { unlink } = await import("node:fs/promises");
      const path = await import("node:path");
      const root = path.join(process.cwd(), "public", "uploads") + path.sep;
      const target = path.normalize(path.join(process.cwd(), "public", asset.url));
      if (target.startsWith(root)) await unlink(target).catch(() => {});
    } catch { /* best effort */ }
    return { ok: true };
  }),
  deleteMany: adminProcedure
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .mutation(({ ctx, input }) => ctx.prisma.mediaAsset.deleteMany({ where: { id: { in: input.ids } } })),
  stats: protectedProcedure.query(async ({ ctx }) => {
    const assets = await ctx.prisma.mediaAsset.findMany({ select: { mimeType: true, sizeBytes: true } });
    const total = assets.length;
    const totalBytes = assets.reduce((s, a) => s + a.sizeBytes, 0);
    const byType = { image: 0, pdf: 0, video: 0, other: 0 };
    for (const a of assets) {
      if (a.mimeType.startsWith("image/")) byType.image++;
      else if (a.mimeType === "application/pdf") byType.pdf++;
      else if (a.mimeType.startsWith("video/")) byType.video++;
      else byType.other++;
    }
    return { total, totalBytes, ...byType };
  }),
});

export const seoRouter = createTRPCRouter({
  redirects: protectedProcedure.query(({ ctx }) =>
    ctx.prisma.redirect.findMany({ orderBy: { createdAt: "desc" } }),
  ),
  upsertRedirect: editorProcedure
    .input(z.object({ fromPath: z.string(), toPath: z.string(), statusCode: z.number().default(301) }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.redirect.upsert({
        where: { fromPath: input.fromPath },
        create: input,
        update: { toPath: input.toPath, statusCode: input.statusCode, isActive: true },
      }),
    ),
  removeRedirect: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.prisma.redirect.delete({ where: { id: input.id } }),
  ),
  toggleRedirect: editorProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.redirect.update({ where: { id: input.id }, data: { isActive: input.isActive } }),
    ),
  incrementHit: editorProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.redirect.update({ where: { id: input.id }, data: { hits: { increment: 1 } } }),
    ),
});

export const apiKeyRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } }),
  ),
  create: adminProcedure
    .input(z.object({
      name: z.string(),
      scope: z.enum(["READ", "READ_WRITE"]).default("READ"),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const crypto = await import("node:crypto");
      const raw = `vrs_live_${crypto.randomBytes(24).toString("hex")}`;
      const hash = crypto.createHash("sha256").update(raw).digest("hex");
      const created = await ctx.prisma.apiKey.create({
        data: {
          name: input.name,
          prefix: "vrs_live_",
          keyHash: hash,
          scope: input.scope,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
        },
      });
      return { ...created, raw };
    }),
  revoke: adminProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) =>
    ctx.prisma.apiKey.delete({ where: { id: input.id } }),
  ),
  updateExpiry: adminProcedure
    .input(z.object({ id: z.string(), expiresAt: z.string().nullable().refine((v) => v === null || !Number.isNaN(Date.parse(v as string)), { message: 'Invalid date' }) }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.apiKey.update({
        where: { id: input.id },
        data: { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null },
      }),
    ),
});

// wire into appRouter as webhook
const KNOWN_WEBHOOK_EVENTS = ["entry.published", "entry.updated"] as const;
type WebhookEvent = (typeof KNOWN_WEBHOOK_EVENTS)[number];

export const webhookRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.prisma.webhookEndpoint.findMany({ orderBy: { createdAt: "desc" } }),
  ),
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      url: WebhookUrl,
      secret: z.string().min(1).max(500),
      events: z.string().max(500).default("entry.published,entry.updated")
      .refine((v) => v.split(",").map((s) => s.trim()).filter(Boolean).every((s) => KNOWN_WEBHOOK_EVENTS.includes(s as WebhookEvent)), {
        message: "Unknown event. Allowed: entry.published, entry.updated",
      }),
      isActive: z.boolean().default(true),
    }))
    .mutation(({ ctx, input }) => ctx.prisma.webhookEndpoint.create({ data: input })),
  update: adminProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      url: WebhookUrl.optional(),
      secret: z.string().min(1).max(500).optional(),
      events: z.string().max(500).optional().refine((v) => v === undefined || v.split(",").map((s) => s.trim()).filter(Boolean).every((s) => KNOWN_WEBHOOK_EVENTS.includes(s as WebhookEvent)), {
      message: "Unknown event. Allowed: entry.published, entry.updated",
    }),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.webhookEndpoint.update({ where: { id }, data });
    }),
  toggle: editorProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) =>
      ctx.prisma.webhookEndpoint.update({ where: { id: input.id }, data: { isActive: input.isActive } }),
    ),
  remove: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.prisma.webhookEndpoint.delete({ where: { id: input.id } })),
  test: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const endpoint = await ctx.prisma.webhookEndpoint.findUnique({ where: { id: input.id } });
      if (!endpoint) throw new TRPCError({ code: "NOT_FOUND", message: "Вебхук не найден" });
      return testWebhook(ctx.prisma, endpoint);
    }),
});

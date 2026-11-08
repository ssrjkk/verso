import { describe, it, expect, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";

function admin(prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role: "ADMIN" } as never,
  } as never);
}
function manager(prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role: "MANAGER" } as never,
  } as never);
}

describe("unique slug auto-suffix (no more P2002 on duplicates)", () => {
  it("entry.create: второй одинаковый title получает slug-2", async () => {
    const seen = new Set<string>();
    const tx = {
      entry: {
        findUnique: vi.fn(async (a: { where: { collectionId_slug: { slug: string } } }) => {
          const s = a.where.collectionId_slug.slug;
          return seen.has(s) ? { slug: s } : null;
        }),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          seen.add(a.data.slug as string);
          return { id: `e-${a.data.slug}`, ...a.data };
        }),
      },
      revision: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
      activityLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      collection: { findUnique: vi.fn(async () => ({ id: "c1" })) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const c = manager(prisma);
    const r1 = await c.entry.create({ collectionId: "c1", title: "Same" });
    const r2 = await c.entry.create({ collectionId: "c1", title: "Same" });
    expect((r1 as { slug: string }).slug).toBe("same");
    expect((r2 as { slug: string }).slug).toBe("same-2");
  });

  it("entry.create: гонка P2002 -> ретрай с новым slug", async () => {
    const seen = new Set<string>();
    let created = 0;
    const tx = {
      entry: {
        findUnique: vi.fn(async (a: { where: { collectionId_slug: { slug: string } } }) =>
          seen.has(a.where.collectionId_slug.slug) ? { slug: a.where.collectionId_slug.slug } : null,
        ),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => {
          created++;
          const slug = a.data.slug as string;
          if (created === 1) {
            // Конкурент успел раньше: строка уже есть, БД кидает P2002.
            seen.add(slug);
            const e = new Error("Unique constraint") as Error & { code: string };
            e.code = "P2002";
            throw e;
          }
          return { id: "e2", ...a.data };
        }),
      },
      revision: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
      activityLog: { create: vi.fn(async () => ({})) },
    };
    const prisma = {
      collection: { findUnique: vi.fn(async () => ({ id: "c1" })) },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const out = await manager(prisma).entry.create({ collectionId: "c1", title: "Race" });
    expect((out as { slug: string }).slug).toBe("race-2");
    expect(tx.entry.create).toHaveBeenCalledTimes(2);
  });

  it("collection.create: дубль имени получает slug-2", async () => {
    const seen = new Set(["taken"]);
    const prisma = {
      collection: {
        findUnique: vi.fn(async (a: { where: { slug: string } }) =>
          seen.has(a.where.slug) ? { slug: a.where.slug } : null,
        ),
        create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "c2", ...a.data })),
      },
    };
    const out = await admin(prisma).collection.create({ name: "Taken" });
    expect((out as { slug: string }).slug).toBe("taken-2");
  });
});

describe("expiry/events validation", () => {
  it("updateExpiry: кривая дата -> 400, null/ISO ок", async () => {
    const update = vi.fn(async () => ({}));
    const c = admin({ apiKey: { update } });
    await expect(c.apiKey.updateExpiry({ id: "k", expiresAt: "not-a-date" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await c.apiKey.updateExpiry({ id: "k", expiresAt: null });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("webhook.create/update: неизвестное событие -> 400", async () => {
    const c = admin({ webhookEndpoint: { create: vi.fn() } });
    await expect(
      c.webhook.create({ name: "n", url: "https://a.b/h", secret: "s", events: "entry.deleted" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      c.webhook.update({ id: "w", events: "entry.published, oops" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

import { describe, it, expect, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";

function manager(prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role: "MANAGER" } as never,
  } as never);
}
function admin(prisma: unknown) {
  return appRouter.createCaller({
    prisma: prisma as never,
    session: null,
    user: { id: "u", email: "u@t.dev", name: "U", role: "ADMIN" } as never,
  } as never);
}

describe("entry.update slug collisions", () => {
  function mockDb(taken: Set<string>) {
    const tx = {
      entry: {
        findUnique: vi.fn(async (a: { where: { id?: string; collectionId_slug?: { slug: string } } }) => {
          if (a.where.id) return { id: "e1", updatedAt: new Date("2026-01-01T00:00:00.000Z"), collectionId: "c1", slug: "old" };
          const s = a.where.collectionId_slug!.slug;
          return taken.has(s) ? { id: "other", slug: s } : null;
        }),
        update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", status: "DRAFT", ...a.data })),
      },
      revision: { count: vi.fn(async () => 1), create: vi.fn(async () => ({})) },
    };
    return { $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)), tx };
  }

  it("чужой занятый slug -> суффикс, свой без изменений", async () => {
    const prisma = mockDb(new Set(["taken"]));
    const out = (await manager(prisma).entry.update({ id: "e1", slug: "taken" })) as unknown as Record<string, unknown>;
    expect(out.slug).toBe("taken-2");
  });

  it("свой текущий slug не трогается", async () => {
    const seen = new Set(["keep-me"]);
    const tx = {
      entry: {
        findUnique: vi.fn(async (a: { where: { id?: string; collectionId_slug?: { slug: string } } }) => {
          if (a.where.id) return { id: "e1", updatedAt: new Date(0), collectionId: "c1", slug: "keep-me" };
          return seen.has(a.where.collectionId_slug!.slug) ? { id: "e1", slug: "keep-me" } : null;
        }),
        update: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: "e1", ...a.data })),
      },
      revision: { count: vi.fn(async () => 1), create: vi.fn(async () => ({})) },
    };
    const out = (await manager({ $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) }).entry.update({
      id: "e1",
      slug: "keep-me",
    })) as unknown as Record<string, unknown>;
    expect(out.slug).toBe("keep-me");
  });
});

describe("webhook test failure path", () => {
  it("недоступный хост -> {ok:false}, без исключений", async () => {
    const failFetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    vi.stubGlobal("fetch", failFetch);
    try {
      const prisma = {
        webhookEndpoint: {
          findUnique: vi.fn(async () => ({ id: "w1", name: "t", url: "http://127.0.0.1:9/hook", secret: "s", events: "entry.published" })),
        },
      };
      const out = (await admin(prisma).webhook.test({ id: "w1" })) as unknown as { ok: boolean; status: number };
      expect(out.ok).toBe(false);
      expect(out.status).toBe(0);
      expect(failFetch).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

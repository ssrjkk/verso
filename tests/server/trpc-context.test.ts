import { beforeEach, describe, expect, it, vi } from "vitest";

const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authApi.getSession } } }));

import { createTRPCContext } from "@/server/trpc";
import { prisma } from "@/lib/prisma";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createTRPCContext", () => {
  it("без сессии: prisma есть, user нет", async () => {
    authApi.getSession.mockResolvedValue(null);
    const ctx = await createTRPCContext({ headers: new Headers() });
    expect(ctx.prisma).toBe(prisma);
    expect(ctx.session).toBeNull();
    expect(ctx.user).toBeUndefined();
  });

  it("с сессией: user прокидывается как есть", async () => {
    const user = { id: "u1", email: "a@b.c", name: "A", role: "ADMIN" };
    authApi.getSession.mockResolvedValue({ user });
    const headers = new Headers({ cookie: "s=1" });

    const ctx = await createTRPCContext({ headers });

    expect(authApi.getSession).toHaveBeenCalledWith({ headers });
    expect(ctx.session).toEqual({ user });
    expect(ctx.user).toEqual(user);
  });
});

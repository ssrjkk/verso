import { beforeEach, describe, expect, it, vi } from "vitest";

const nextHeaders = vi.hoisted(() => ({ headers: vi.fn() }));
const authApi = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: nextHeaders.headers }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: authApi.getSession } } }));

import { getCurrentUser, getSession } from "@/lib/get-session";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("get-session", () => {
  it("getSession передаёт текущие headers в Better Auth", async () => {
    const h = new Headers({ cookie: "s=1" });
    nextHeaders.headers.mockResolvedValue(h);
    authApi.getSession.mockResolvedValue({ user: { id: "u1" } });

    await expect(getSession()).resolves.toEqual({ user: { id: "u1" } });
    expect(authApi.getSession).toHaveBeenCalledWith({ headers: h });
  });

  it("getCurrentUser возвращает user или null", async () => {
    nextHeaders.headers.mockResolvedValue(new Headers());
    authApi.getSession.mockResolvedValueOnce({ user: { id: "u1", name: "U" } });
    await expect(getCurrentUser()).resolves.toEqual({ id: "u1", name: "U" });

    authApi.getSession.mockResolvedValueOnce(null);
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("getCurrentUser не падает на сессии без user", async () => {
    nextHeaders.headers.mockResolvedValue(new Headers());
    authApi.getSession.mockResolvedValue({});
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

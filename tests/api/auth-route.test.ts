import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handler = { GET: vi.fn(), POST: vi.fn() };
  return {
    auth: { marker: "auth" },
    handler,
    toNextJsHandler: vi.fn(() => handler),
  };
});

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("better-auth/next-js", () => ({ toNextJsHandler: mocks.toNextJsHandler }));

import { GET, POST } from "@/app/api/auth/[...all]/route";

describe("GET/POST /api/auth/[...all]", () => {
  it("прокидывает auth в Next-адаптер better-auth", () => {
    expect(mocks.toNextJsHandler).toHaveBeenCalledWith(mocks.auth);
    expect(GET).toBe(mocks.handler.GET);
    expect(POST).toBe(mocks.handler.POST);
  });
});

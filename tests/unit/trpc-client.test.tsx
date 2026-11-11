import { describe, expect, it, vi } from "vitest";
import superjson from "superjson";

const mocks = vi.hoisted(() => {
  const client = { marker: "trpc-client" };
  const createClient = vi.fn(() => client);
  const trpc = { createClient };
  return {
    client,
    createClient,
    trpc,
    createTRPCReact: vi.fn(() => trpc),
    httpBatchLink: vi.fn((opts: unknown) => ({ batch: opts })),
  };
});

vi.mock("@trpc/client", () => ({ httpBatchLink: mocks.httpBatchLink }));
vi.mock("@trpc/react-query", () => ({ createTRPCReact: mocks.createTRPCReact }));

import { getTrpcClient, trpc } from "@/trpc/client";

describe("trpc/client", () => {
  it("создаёт React-клиент с batch-линком на /api/trpc и superjson", () => {
    expect(mocks.createTRPCReact).toHaveBeenCalledTimes(1);
    expect(trpc).toBe(mocks.trpc);
    expect(getTrpcClient()).toBe(mocks.client);
    expect(mocks.createClient).toHaveBeenCalledWith({
      links: [{ batch: { url: "/api/trpc", transformer: superjson } }],
    });
  });
});

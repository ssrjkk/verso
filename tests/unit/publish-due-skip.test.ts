import { describe, expect, it, vi } from "vitest";
import { publishDue } from "@/lib/publish-due";

describe("publishDue: конкурентный пропуск", () => {
  it("условный updateMany не переключил запись -> без ревизии и вебхука", async () => {
    const due = {
      id: "e1",
      authorId: "u1",
      status: "SCHEDULED",
      scheduledFor: new Date("2026-05-01T00:00:00.000Z"),
      blocks: [],
    };
    const tx = {
      entry: {
        findMany: vi.fn(async () => [due]),
        // Другой прогон уже опубликовал запись между findMany и updateMany.
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
      revision: { count: vi.fn(), create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
      entry: { findMany: vi.fn() },
    };

    const out = await publishDue(prisma as never, new Date("2026-06-01T12:00:00.000Z"));

    expect(out).toEqual([]);
    expect(tx.revision.count).not.toHaveBeenCalled();
    expect(tx.revision.create).not.toHaveBeenCalled();
    expect(prisma.entry.findMany).not.toHaveBeenCalled();
  });
});

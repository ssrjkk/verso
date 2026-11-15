import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMany = vi.fn();
const db = {
  webhookDelivery: { deleteMany },
} as unknown as PrismaClient;

beforeEach(() => {
  vi.resetModules();
  deleteMany.mockReset();
});

describe("maybePruneWebhookDeliveries: троттлинг", () => {
  it("неудачная очистка не откладывает следующую попытку на 6 часов", async () => {
    const { maybePruneWebhookDeliveries } = await import("@/lib/webhook-outbox");

    deleteMany.mockRejectedValueOnce(new Error("SQLITE_BUSY"));
    await expect(maybePruneWebhookDeliveries(db, new Date(0))).rejects.toThrow("SQLITE_BUSY");

    deleteMany.mockResolvedValueOnce({ count: 2 });
    await expect(maybePruneWebhookDeliveries(db, new Date(1000))).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });

  it("успешная очистка соблюдает шестичасовой интервал", async () => {
    const { maybePruneWebhookDeliveries } = await import("@/lib/webhook-outbox");
    const sixHours = 6 * 60 * 60_000;

    deleteMany.mockResolvedValue({ count: 0 });
    await maybePruneWebhookDeliveries(db, new Date(0));
    await maybePruneWebhookDeliveries(db, new Date(sixHours - 1));
    expect(deleteMany).toHaveBeenCalledTimes(1);

    await maybePruneWebhookDeliveries(db, new Date(sixHours + 1));
    expect(deleteMany).toHaveBeenCalledTimes(2);
  });
});

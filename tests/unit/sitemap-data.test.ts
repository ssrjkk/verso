import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  collectionFindMany: vi.fn(),
  entryFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collection: { findMany: db.collectionFindMany },
    entry: { findMany: db.entryFindMany },
  },
}));

import { getSitemapEntries } from "@/lib/sitemap-data";

let savedAppUrl: string | undefined;
let savedAuthUrl: string | undefined;

beforeEach(() => {
  savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.BETTER_AUTH_URL;
  db.collectionFindMany.mockReset();
  db.entryFindMany.mockReset();
  db.collectionFindMany.mockResolvedValue([]);
  db.entryFindMany.mockResolvedValue([]);
});

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  if (savedAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedAuthUrl;
});

describe("getSitemapEntries", () => {
  it("строит URL коллекций и записей от NEXT_PUBLIC_APP_URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cms.example.com/";
    const collectionDate = new Date("2026-01-02T03:04:05.000Z");
    const publishedAt = new Date("2026-02-03T00:00:00.000Z");
    const updatedAt = new Date("2026-02-04T00:00:00.000Z");
    db.collectionFindMany.mockResolvedValue([{ slug: "posts", updatedAt: collectionDate }]);
    db.entryFindMany.mockResolvedValue([
      { slug: "hello", publishedAt, updatedAt, collection: { slug: "posts" } },
    ]);

    const entries = await getSitemapEntries();

    expect(entries).toEqual([
      { url: "https://cms.example.com/c/posts", lastModified: collectionDate },
      { url: "https://cms.example.com/p/posts/hello", lastModified: publishedAt },
    ]);
  });

  it("для записи без publishedAt берёт updatedAt", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cms.example.com";
    const updatedAt = new Date("2026-03-04T00:00:00.000Z");
    db.entryFindMany.mockResolvedValue([
      { slug: "draft-turned-published", publishedAt: null, updatedAt, collection: { slug: "cases" } },
    ]);

    const [entry] = await getSitemapEntries();

    expect(entry.lastModified).toBe(updatedAt);
  });

  it("запрашивает только PUBLISHED-записи", async () => {
    await getSitemapEntries();

    expect(db.entryFindMany).toHaveBeenCalledWith({
      where: { status: "PUBLISHED" },
      select: {
        slug: true,
        updatedAt: true,
        publishedAt: true,
        collection: { select: { slug: true } },
      },
    });
  });

  it("падает обратно на BETTER_AUTH_URL", async () => {
    process.env.BETTER_AUTH_URL = "http://localhost:3100/";
    db.collectionFindMany.mockResolvedValue([
      { slug: "pages", updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    const [entry] = await getSitemapEntries();

    expect(entry.url).toBe("http://localhost:3100/c/pages");
  });

  it("без env использует localhost:3000", async () => {
    db.collectionFindMany.mockResolvedValue([
      { slug: "pages", updatedAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    const [entry] = await getSitemapEntries();

    expect(entry.url).toBe("http://localhost:3000/c/pages");
  });

  it("пустая база даёт пустой sitemap", async () => {
    await expect(getSitemapEntries()).resolves.toEqual([]);
  });
});

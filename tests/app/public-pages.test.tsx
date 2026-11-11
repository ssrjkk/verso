import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

const db = vi.hoisted(() => ({
  collectionFindUnique: vi.fn(),
  entryFindFirst: vi.fn(),
}));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_NOT_FOUND";
    throw err;
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    collection: { findUnique: db.collectionFindUnique },
    entry: { findFirst: db.entryFindFirst },
  },
}));

vi.mock("next/navigation", () => ({ notFound }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import PublicEntryPage, { generateMetadata as entryMetadata } from "@/app/p/[collection]/[slug]/page";
import PublicCollectionPage, { generateMetadata as collectionMetadata } from "@/app/c/[slug]/page";

const updatedAt = new Date("2026-02-03T04:05:06.000Z");

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    title: "Привет, мир",
    slug: "privet",
    excerpt: "Короткое описание",
    status: "PUBLISHED",
    seoTitle: null,
    seoDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noIndex: false,
    publishedAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt,
    collection: { slug: "posts", name: "Статьи" },
    blocks: [
      {
        id: "b1",
        type: "HERO",
        propsJson: JSON.stringify({ title: "Блок-заголовок", ctaLabel: "Вперёд", ctaHref: "javascript:alert(1)" }),
        isVisible: true,
        order: 0,
      },
    ],
    tags: [{ tag: { name: "новости", color: "#ff0000" } }],
    ...overrides,
  };
}

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

beforeEach(() => {
  db.collectionFindUnique.mockReset();
  db.entryFindFirst.mockReset();
  notFound.mockClear();
});

describe("public entry page", () => {
  it("metadata берёт SEO-поля записи", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(
      entry({
        seoTitle: "SEO-заголовок",
        seoDescription: "SEO-описание",
        ogImageUrl: "https://cdn.test/og.png",
        canonicalUrl: "https://site.test/canonical",
        noIndex: true,
      }),
    );

    const meta = await entryMetadata(params({ collection: "posts", slug: "privet" }));

    expect(meta.title).toBe("SEO-заголовок");
    expect(meta.description).toBe("SEO-описание");
    expect(meta.alternates).toEqual({ canonical: "https://site.test/canonical" });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.openGraph).toMatchObject({
      type: "article",
      title: "SEO-заголовок",
      description: "SEO-описание",
      images: [{ url: "https://cdn.test/og.png" }],
    });
  });

  it("metadata падает обратно на title/excerpt и не ставит robots", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(entry());

    const meta = await entryMetadata(params({ collection: "posts", slug: "privet" }));

    expect(meta.title).toBe("Привет, мир");
    expect(meta.description).toBe("Короткое описание");
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
  });

  it("metadata для отсутствующей записи пустая", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(null);
    await expect(entryMetadata(params({ collection: "posts", slug: "nope" }))).resolves.toEqual({});
  });

  it("запрашивает только PUBLISHED и только видимые блоки по order", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(entry());

    await PublicEntryPage(params({ collection: "posts", slug: "privet" }));

    expect(db.entryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { collectionId: "c1", slug: "privet", status: "PUBLISHED" },
        include: expect.objectContaining({
          blocks: { where: { isVisible: true }, orderBy: { order: "asc" } },
        }),
      }),
    );
  });

  it("рендерит заголовок, коллекцию, теги, дату и безопасный CTA", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(entry());

    const html = renderToStaticMarkup(await PublicEntryPage(params({ collection: "posts", slug: "privet" })));

    expect(html).toContain("Привет, мир");
    expect(html).toContain("Статьи");
    expect(html).toContain("Короткое описание");
    expect(html).toContain("новости");
    expect(html).toContain("Блок-заголовок");
    expect(html).toContain('href="#"');
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="/c/posts"');
  });

  it("показывает пустое состояние без блоков", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(entry({ blocks: [] }));

    const html = renderToStaticMarkup(await PublicEntryPage(params({ collection: "posts", slug: "privet" })));

    expect(html).toContain("У этой записи пока нет блоков");
  });

  it("несуществующая коллекция -> notFound", async () => {
    db.collectionFindUnique.mockResolvedValue(null);
    await expect(PublicEntryPage(params({ collection: "nope", slug: "x" }))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(db.entryFindFirst).not.toHaveBeenCalled();
  });

  it("черновик -> notFound", async () => {
    db.collectionFindUnique.mockResolvedValue({ id: "c1", slug: "posts", name: "Статьи" });
    db.entryFindFirst.mockResolvedValue(null);
    await expect(PublicEntryPage(params({ collection: "posts", slug: "draft" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("public collection page", () => {
  it("metadata берёт название и описание коллекции", async () => {
    db.collectionFindUnique.mockResolvedValue({ name: "Кейсы", slug: "cases", description: "Наши работы", entries: [] });
    const meta = await collectionMetadata(params({ slug: "cases" }));
    expect(meta.title).toBe("Кейсы");
    expect(meta.description).toBe("Наши работы");
    expect(meta.openGraph).toMatchObject({ title: "Кейсы", type: "website" });
  });

  it("metadata без описания даёт фолбэк", async () => {
    db.collectionFindUnique.mockResolvedValue({ name: "Кейсы", slug: "cases", description: null, entries: [] });
    const meta = await collectionMetadata(params({ slug: "cases" }));
    expect(meta.description).toBe("Публикации коллекции «Кейсы»");
  });

  it("запрашивает только PUBLISHED, новые сверху, лимит 50", async () => {
    db.collectionFindUnique.mockResolvedValue({ name: "Кейсы", slug: "cases", description: null, entries: [] });
    await PublicCollectionPage(params({ slug: "cases" }));
    expect(db.collectionFindUnique).toHaveBeenCalledWith({
      where: { slug: "cases" },
      select: expect.objectContaining({
        entries: expect.objectContaining({
          where: { status: "PUBLISHED" },
          orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
          take: 50,
        }),
      }),
    });
  });

  it("рендерит карточки со ссылками на записи", async () => {
    db.collectionFindUnique.mockResolvedValue({
      name: "Кейсы",
      slug: "cases",
      description: "Наши работы",
      entries: [
        { id: "e1", title: "Первый кейс", slug: "first", excerpt: "Описание", publishedAt: updatedAt, updatedAt },
        { id: "e2", title: "Второй кейс", slug: "second", excerpt: null, publishedAt: null, updatedAt },
      ],
    });

    const html = renderToStaticMarkup(await PublicCollectionPage(params({ slug: "cases" })));

    expect(html).toContain("Кейсы");
    expect(html).toContain("Наши работы");
    expect(html).toContain("Первый кейс");
    expect(html).toContain("Второй кейс");
    expect(html).toContain('href="/p/cases/first"');
    expect(html).toContain('href="/p/cases/second"');
  });

  it("показывает пустое состояние коллекции", async () => {
    db.collectionFindUnique.mockResolvedValue({ name: "Пусто", slug: "empty", description: null, entries: [] });
    const html = renderToStaticMarkup(await PublicCollectionPage(params({ slug: "empty" })));
    expect(html).toContain("В этой коллекции пока нет опубликованных записей");
  });

  it("несуществующая коллекция -> notFound", async () => {
    db.collectionFindUnique.mockResolvedValue(null);
    await expect(PublicCollectionPage(params({ slug: "nope" }))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import BlockRender from "@/components/blocks/BlockRender";

type Props = { params: Promise<{ collection: string; slug: string }> };

const getPublishedEntry = cache(async (collectionSlug: string, entrySlug: string) => {
  const collection = await prisma.collection.findUnique({
    where: { slug: collectionSlug },
    select: { id: true, slug: true, name: true },
  });
  if (!collection) return null;

  return prisma.entry.findFirst({
    where: {
      collectionId: collection.id,
      slug: entrySlug,
      status: "PUBLISHED",
    },
    include: {
      collection: { select: { slug: true, name: true } },
      blocks: { where: { isVisible: true }, orderBy: { order: "asc" } },
      tags: { include: { tag: { select: { name: true, color: true } } } },
    },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection, slug } = await params;
  const entry = await getPublishedEntry(collection, slug);
  if (!entry) return {};

  const title = entry.seoTitle?.trim() || entry.title;
  const description =
    entry.seoDescription?.trim() || entry.excerpt?.trim() || `Публикация в коллекции «${entry.collection.name}»`;
  const images = entry.ogImageUrl ? [{ url: entry.ogImageUrl }] : undefined;

  return {
    title,
    description,
    alternates: entry.canonicalUrl ? { canonical: entry.canonicalUrl } : undefined,
    robots: entry.noIndex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      title,
      description,
      images,
      publishedTime: entry.publishedAt?.toISOString(),
      modifiedTime: entry.updatedAt.toISOString(),
    },
  };
}

export default async function PublicEntryPage({ params }: Props) {
  const { collection, slug } = await params;
  const entry = await getPublishedEntry(collection, slug);
  if (!entry) notFound();

  const publishedLabel = entry.publishedAt
    ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(entry.publishedAt)
    : null;

  return (
    <div className="min-h-screen bg-[#f4f3fa] text-neutral-900 dark:bg-ink-950 dark:text-neutral-100">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-ink-900/60">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-display text-lg font-extrabold">
            <span className="text-[#9a3412] dark:text-[#f97316]">Verso</span>
          </Link>
          <Link
            href={`/c/${entry.collection.slug}`}
            className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            ← {entry.collection.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#9a3412] dark:text-[#fb923c]">
              {entry.collection.name}
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{entry.title}</h1>
            {entry.excerpt ? (
              <p className="max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
                {entry.excerpt}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
              {publishedLabel ? <time dateTime={entry.publishedAt!.toISOString()}>{publishedLabel}</time> : null}
              {entry.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Теги">
                  {entry.tags.map(({ tag }) => (
                    <li
                      key={tag.name}
                      className="rounded-full border border-black/10 px-2.5 py-0.5 font-semibold dark:border-white/15"
                      style={tag.color ? { borderColor: `${tag.color}55` } : undefined}
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </header>

          {entry.blocks.length > 0 ? (
            <div className="flex flex-col gap-5">
              {entry.blocks.map((block) => (
                <BlockRender key={block.id} type={block.type} propsJson={block.propsJson} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-neutral-500 dark:border-white/15 dark:text-neutral-400">
              У этой записи пока нет блоков.
            </div>
          )}
        </article>
      </main>

      <footer className="border-t border-black/10 py-6 dark:border-white/10">
        <p className="mx-auto w-full max-w-4xl px-6 text-xs text-neutral-500 dark:text-neutral-400">
          Опубликовано в <span className="font-semibold text-neutral-700 dark:text-neutral-200">Verso</span>
        </p>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ slug: string }> };

const PAGE_SIZE = 50;

const getCollectionWithEntries = cache(async (slug: string) => {
  return prisma.collection.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      description: true,
      entries: {
        where: { status: "PUBLISHED" },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          publishedAt: true,
          updatedAt: true,
        },
      },
    },
  });
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionWithEntries(slug);
  if (!collection) return {};

  const description = collection.description?.trim() || `Публикации коллекции «${collection.name}»`;
  return {
    title: collection.name,
    description,
    openGraph: { title: collection.name, description, type: "website" },
  };
}

export default async function PublicCollectionPage({ params }: Props) {
  const { slug } = await params;
  const collection = await getCollectionWithEntries(slug);
  if (!collection) notFound();

  const fmt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" });

  return (
    <div className="min-h-screen bg-paper text-ink-950 dark:bg-ink-950 dark:text-[#f2ede2]">
      <header className="border-b border-ink-950/10 bg-paper/85 backdrop-blur dark:border-white/10 dark:bg-ink-950/85">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid size-7 place-items-center rounded-[2px] bg-accent-strong font-mono text-[10px] font-semibold text-white"
            >
              V
            </span>
            <span className="font-display text-lg font-bold">Verso</span>
          </Link>
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft"
          >
            На главную
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-14">
        <header className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink dark:text-accent-soft">
            Коллекция · {collection.entries.length} публикаций
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
            {collection.name}
          </h1>
          {collection.description ? (
            <p className="mt-4 text-base leading-relaxed text-stone-600 dark:text-stone-300">
              {collection.description}
            </p>
          ) : null}
        </header>

        {collection.entries.length > 0 ? (
          <ul className="mt-10 border-t border-ink-950/20 dark:border-white/20" role="list">
            {collection.entries.map((entry, index) => {
              const date = entry.publishedAt ?? entry.updatedAt;
              return (
                <li key={entry.id} className="border-b border-ink-950/10 dark:border-white/10">
                  <Link
                    href={`/p/${collection.slug}/${entry.slug}`}
                    className="group grid gap-2 py-5 focus-visible:outline-none sm:grid-cols-[7rem_1fr] sm:gap-5"
                  >
                    <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                      <span className="font-mono text-[10px] text-stone-600 dark:text-stone-400">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <time
                        dateTime={date.toISOString()}
                        className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400"
                      >
                        {fmt.format(date)}
                      </time>
                    </div>
                    <div>
                      <h2 className="font-display text-xl font-semibold leading-snug tracking-[-0.015em] group-hover:text-accent-ink dark:group-hover:text-accent-soft">
                        {entry.title}
                      </h2>
                      {entry.excerpt ? (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                          {entry.excerpt}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-10 border border-dashed border-ink-950/20 p-10 text-center text-sm text-stone-600 dark:border-white/20 dark:text-stone-400">
            В этой коллекции пока нет опубликованных записей.
          </div>
        )}
      </main>

      <footer className="border-t border-ink-950/10 py-6 dark:border-white/10">
        <p className="mx-auto w-full max-w-4xl px-6 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
          Опубликовано в <span className="font-semibold text-stone-700 dark:text-stone-200">Verso</span>
        </p>
      </footer>
    </div>
  );
}

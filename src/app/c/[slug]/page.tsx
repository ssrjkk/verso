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
    <div className="min-h-screen bg-[#f4f3fa] text-neutral-900 dark:bg-ink-950 dark:text-neutral-100">
      <header className="border-b border-black/10 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-ink-900/60">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="font-display text-lg font-extrabold">
            <span className="text-[#9a3412] dark:text-[#f97316]">Verso</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-semibold text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            На главную
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <section className="flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#9a3412] dark:text-[#fb923c]">
              Коллекция
            </p>
            <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">{collection.name}</h1>
            {collection.description ? (
              <p className="max-w-2xl text-base leading-relaxed text-neutral-600 dark:text-neutral-400">
                {collection.description}
              </p>
            ) : null}
          </header>

          {collection.entries.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2" role="list">
              {collection.entries.map((entry) => {
                const date = entry.publishedAt ?? entry.updatedAt;
                return (
                  <li key={entry.id}>
                    <Link
                      href={`/p/${collection.slug}/${entry.slug}`}
                      className="group flex h-full flex-col gap-2 rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition hover:shadow-md focus-visible:outline-none dark:border-white/10 dark:bg-ink-900"
                    >
                      <h2 className="font-display text-lg font-bold leading-snug group-hover:text-[#9a3412] dark:group-hover:text-[#fb923c]">
                        {entry.title}
                      </h2>
                      {entry.excerpt ? (
                        <p className="line-clamp-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                          {entry.excerpt}
                        </p>
                      ) : null}
                      <time
                        dateTime={date.toISOString()}
                        className="mt-auto pt-1 text-xs text-neutral-500 dark:text-neutral-400"
                      >
                        {fmt.format(date)}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-black/15 p-10 text-center text-sm text-neutral-500 dark:border-white/15 dark:text-neutral-400">
              В этой коллекции пока нет опубликованных записей.
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-black/10 py-6 dark:border-white/10">
        <p className="mx-auto w-full max-w-4xl px-6 text-xs text-neutral-500 dark:text-neutral-400">
          Опубликовано в <span className="font-semibold text-neutral-700 dark:text-neutral-200">Verso</span>
        </p>
      </footer>
    </div>
  );
}

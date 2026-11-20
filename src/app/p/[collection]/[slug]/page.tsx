import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import BlockRender from "@/components/blocks/BlockRender";
import {
  parseCollectionSchema,
  parseFieldValues,
  type CollectionField,
} from "@/lib/collection-schema";

type Props = { params: Promise<{ collection: string; slug: string }> };

function PublicFieldValue({ field, value }: { field: CollectionField; value: unknown }) {
  if (value === undefined || value === null || value === "") return <>—</>;
  if (field.type === "checkbox") return <>{value === true ? "Да" : "Нет"}</>;
  if (field.type === "date" && typeof value === "string") {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) {
      return <>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "long" }).format(date)}</>;
    }
  }
  if (field.type === "url" && typeof value === "string") {
    return (
      <a
        href={value}
        rel="noreferrer noopener"
        className="underline decoration-accent/40 underline-offset-2 hover:text-accent-ink dark:hover:text-accent-soft"
        target="_blank"
      >
        {value}
      </a>
    );
  }
  if (field.type === "email" && typeof value === "string") {
    return (
      <a
        href={`mailto:${value}`}
        className="underline decoration-accent/40 underline-offset-2 hover:text-accent-ink dark:hover:text-accent-soft"
      >
        {value}
      </a>
    );
  }
  return (
    <span className="whitespace-pre-line">
      {typeof value === "object" ? JSON.stringify(value) : String(value)}
    </span>
  );
}

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
      collection: { select: { slug: true, name: true, schemaJson: true } },
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

  const schema = parseCollectionSchema(entry.collection.schemaJson);
  const fieldValues = parseFieldValues(entry.fieldsJson);
  const details = schema.flatMap((field) => {
    const value = fieldValues[field.key];
    if (value === undefined || value === null || value === "") return [];
    return [{ field, value }];
  });

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
            href={`/c/${entry.collection.slug}`}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-stone-600 hover:text-accent-ink dark:text-stone-400 dark:hover:text-accent-soft"
          >
            ← {entry.collection.name}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-14">
        <article className="flex flex-col gap-8">
          <header className="max-w-2xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-ink dark:text-accent-soft">
              {entry.collection.name}
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.06] tracking-[-0.03em] sm:text-5xl">
              {entry.title}
            </h1>
            {entry.excerpt ? (
              <p className="mt-4 text-lg leading-relaxed text-stone-600 dark:text-stone-300">
                {entry.excerpt}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
              {publishedLabel ? (
                <time dateTime={entry.publishedAt!.toISOString()}>{publishedLabel}</time>
              ) : null}
              {entry.tags.length > 0 ? (
                <ul className="flex flex-wrap gap-2" aria-label="Теги">
                  {entry.tags.map(({ tag }) => (
                    <li
                      key={tag.name}
                      className="border border-ink-950/15 px-2 py-0.5 dark:border-white/15"
                      style={tag.color ? { borderColor: `${tag.color}55` } : undefined}
                    >
                      {tag.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </header>

          {details.length > 0 ? (
            <section aria-labelledby="entry-details">
              <h2
                id="entry-details"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-stone-600 dark:text-stone-400"
              >
                Детали
              </h2>
              <dl className="mt-3 border-t border-ink-950/20 dark:border-white/20">
                {details.map(({ field, value }) => (
                  <div
                    key={field.key}
                    className="grid gap-1 border-b border-ink-950/10 py-3 dark:border-white/10 sm:grid-cols-[12rem_1fr] sm:gap-4"
                  >
                    <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
                      {field.label}
                    </dt>
                    <dd className="text-sm text-ink-950 dark:text-stone-200">
                      <PublicFieldValue field={field} value={value} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {entry.blocks.length > 0 ? (
            <div className="flex flex-col gap-5">
              {entry.blocks.map((block) => (
                <BlockRender key={block.id} type={block.type} propsJson={block.propsJson} />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-ink-950/20 p-8 text-center text-sm text-stone-600 dark:border-white/20 dark:text-stone-400">
              У этой записи пока нет блоков.
            </div>
          )}
        </article>
      </main>

      <footer className="border-t border-ink-950/10 py-6 dark:border-white/10">
        <p className="mx-auto w-full max-w-4xl px-6 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-600 dark:text-stone-400">
          Опубликовано в <span className="font-semibold text-stone-700 dark:text-stone-200">Verso</span>
        </p>
      </footer>
    </div>
  );
}

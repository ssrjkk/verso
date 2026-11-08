import { prisma } from "@/lib/prisma";

export type SitemapEntry = {
  url: string;
  lastModified: Date;
};

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

/** Публичные URL (только опубликованные записи). Единый источник для sitemap-маршрутов. */
export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const base = baseUrl();
  const [collections, entries] = await Promise.all([
    prisma.collection.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.entry.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true, publishedAt: true, collection: { select: { slug: true } } },
    }),
  ]);
  const out: SitemapEntry[] = collections.map((c) => ({
    url: `${base}/c/${c.slug}`,
    lastModified: c.updatedAt,
  }));
  for (const e of entries) {
    out.push({
      url: `${base}/p/${e.collection.slug}/${e.slug}`,
      lastModified: e.publishedAt ?? e.updatedAt,
    });
  }
  return out;
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [collections, entries] = await Promise.all([
    prisma.collection.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.entry.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true, publishedAt: true, collection: { select: { slug: true } } },
    }),
  ]);
  const urls: string[] = collections.map(
    (c) => `  <url><loc>${esc(base)}/c/${esc(c.slug)}</loc><lastmod>${c.updatedAt.toISOString()}</lastmod></url>`,
  );
  for (const e of entries) {
    const lastmod = (e.publishedAt ?? e.updatedAt).toISOString();
    urls.push(
      `  <url><loc>${esc(base)}/p/${esc(e.collection.slug)}/${esc(e.slug)}</loc><lastmod>${lastmod}</lastmod></url>`,
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
}

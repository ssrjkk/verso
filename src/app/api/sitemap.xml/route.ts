import { NextResponse } from "next/server";
import { getSitemapEntries } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const entries = await getSitemapEntries();
  const urls = entries.map(
    (e) => `  <url><loc>${esc(e.url)}</loc><lastmod>${e.lastModified.toISOString()}</lastmod></url>`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
  return new NextResponse(xml, { headers: { "Content-Type": "application/xml" } });
}

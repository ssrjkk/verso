import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/sitemap-data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = await getSitemapEntries();
  return entries.map((e) => ({ url: e.url, lastModified: e.lastModified }));
}

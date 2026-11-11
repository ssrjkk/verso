import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sitemap = vi.hoisted(() => ({ getSitemapEntries: vi.fn() }));

vi.mock("@/lib/sitemap-data", () => ({
  getSitemapEntries: sitemap.getSitemapEntries,
}));

import { GET as sitemapXmlGET } from "@/app/api/sitemap.xml/route";
import sitemapRoute from "@/app/sitemap";
import robots from "@/app/robots";

let savedAppUrl: string | undefined;
let savedAuthUrl: string | undefined;

beforeEach(() => {
  savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.BETTER_AUTH_URL;
  sitemap.getSitemapEntries.mockReset();
});

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;
  if (savedAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedAuthUrl;
});

describe("GET /api/sitemap.xml", () => {
  it("отдаёт XML с lastmod и экранирует спецсимволы", async () => {
    sitemap.getSitemapEntries.mockResolvedValue([
      { url: "https://x.test/c/a&b", lastModified: new Date("2026-01-02T03:04:05.000Z") },
      { url: "https://x.test/p/c/<tag>", lastModified: new Date("2026-02-03T00:00:00.000Z") },
    ]);

    const res = await sitemapXmlGET();
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml");
    expect(body).toContain("<loc>https://x.test/c/a&amp;b</loc>");
    expect(body).toContain("<loc>https://x.test/p/c/&lt;tag&gt;</loc>");
    expect(body).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
    expect(body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("пустой список даёт валидный пустой urlset", async () => {
    sitemap.getSitemapEntries.mockResolvedValue([]);
    const res = await sitemapXmlGET();
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).not.toContain("<url>");
    expect(body.trim().endsWith("</urlset>")).toBe(true);
  });
});

describe("app/sitemap", () => {
  it("прокидывает url/lastModified из общего источника", async () => {
    const lastModified = new Date("2026-05-06T07:08:09.000Z");
    sitemap.getSitemapEntries.mockResolvedValue([{ url: "https://x.test/p/a/b", lastModified }]);

    await expect(sitemapRoute()).resolves.toEqual([
      { url: "https://x.test/p/a/b", lastModified },
    ]);
  });
});

describe("app/robots", () => {
  it("закрывает служебные разделы и указывает sitemap", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://cms.example.com/";
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;

    expect(r.sitemap).toBe("https://cms.example.com/sitemap.xml");
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    for (const path of ["/dashboard", "/entries", "/api/", "/sign-in", "/settings"]) {
      expect(rules.disallow).toContain(path);
    }
  });

  it("падает обратно на BETTER_AUTH_URL и localhost", () => {
    process.env.BETTER_AUTH_URL = "http://localhost:3100";
    expect(robots().sitemap).toBe("http://localhost:3100/sitemap.xml");

    delete process.env.BETTER_AUTH_URL;
    expect(robots().sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});

import { test, expect } from "@playwright/test";

async function trpc<T = unknown>(
  page: import("@playwright/test").Page,
  path: string,
  input: unknown,
) {
  const res = await page.request.post(`/api/trpc/${path}?batch=1`, {
    headers: { "content-type": "application/json" },
    data: { "0": { json: input } },
  });
  expect(res.ok(), `tRPC ${path} -> ${res.status()}`).toBeTruthy();
  const json = await res.json();
  return json[0].result.data.json as T;
}

test("public collection and published entry pages are served; drafts stay private", async ({ page }) => {
  const ts = Date.now();
  const colName = `Public ${ts}`;
  const colSlug = `public-${ts}`;
  const publishedTitle = `Published ${ts}`;
  const draftTitle = `Draft ${ts}`;

  await page.goto("/sign-in");
  await page.locator("#signin-email").fill("admin@verso.dev");
  await page.locator("#signin-password").fill("Test12345!");
  await page.locator("form button").first().click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

  const col = await trpc<{ id: string; slug: string }>(page, "collection.create", { name: colName });
  expect(col.slug).toBe(colSlug);

  const pub = await trpc<{ id: string; slug: string }>(page, "entry.create", {
    collectionId: col.id,
    title: publishedTitle,
  });
  const draft = await trpc<{ id: string; slug: string }>(page, "entry.create", {
    collectionId: col.id,
    title: draftTitle,
  });
  await trpc(page, "entry.publish", { id: pub.id });

  // Публичная страница записи (только PUBLISHED).
  const entryRes = await page.request.get(`/p/${colSlug}/${pub.slug}`);
  expect(entryRes.status()).toBe(200);
  const entryHtml = await entryRes.text();
  expect(entryHtml).toContain(publishedTitle);
  expect(entryHtml).toContain(colName);

  // Черновик не должен быть доступен публично.
  const draftRes = await page.request.get(`/p/${colSlug}/${draft.slug}`);
  expect(draftRes.status()).toBe(404);

  // Публичная страница коллекции со ссылкой на опубликованную запись.
  const colRes = await page.request.get(`/c/${colSlug}`);
  expect(colRes.status()).toBe(200);
  const colHtml = await colRes.text();
  expect(colHtml).toContain(colName);
  expect(colHtml).toContain(publishedTitle);
  expect(colHtml).not.toContain(draftTitle);
  expect(colHtml).toContain(`/p/${colSlug}/${pub.slug}`);

  // Канонический sitemap и совместимый маршрут содержат публичные URL.
  for (const path of ["/sitemap.xml", "/api/sitemap.xml"]) {
    const sm = await page.request.get(path);
    expect(sm.status(), path).toBe(200);
    const body = await sm.text();
    expect(body, path).toContain(`/c/${colSlug}`);
    expect(body, path).toContain(`/p/${colSlug}/${pub.slug}`);
    expect(body, path).not.toContain(`/p/${colSlug}/${draft.slug}`);
  }
});

test("unknown public pages return 404", async ({ request }) => {
  const a = await request.get("/c/does-not-exist-collection-xyz");
  expect(a.status()).toBe(404);
  const b = await request.get("/p/posts/does-not-exist-entry-xyz");
  expect(b.status()).toBe(404);
});

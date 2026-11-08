import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/editor.json" });

async function trpc(page: Page, path: string, json?: unknown, isQuery = false) {
  const payload = json === undefined
    ? { "0": { json: null, meta: { values: ["undefined"], v: 1 } } }
    : { "0": { json } };
  const r = isQuery
    ? await page.request.get(
        `/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`,
      )
    : await page.request.post(`/api/trpc/${path}?batch=1`, {
        headers: { "content-type": "application/json" },
        data: payload,
      });
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { message: string } } }>;
  return { status: r.status(), op: j[0] };
}

// SEO-панель: title/description сохраняются и переживают reload.
test("seo panel persists", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E seo ${ts}` });
  const entry = created.op.result?.data.json as { id: string };

  const seoTitle = `E2E SEO title ${ts}`;
  const seoDesc = `E2E SEO desc ${ts}`;
  await page.goto(`/entries/${entry.id}`);
  await page.getByLabel("SEO-заголовок").fill(seoTitle);
  await page.getByLabel("SEO-описание").fill(seoDesc);
  await page.getByRole("button", { name: "Сохранить SEO" }).click();
  await page.waitForResponse(/entry\.update/, { timeout: 15000 });

  await page.reload();
  await expect(page.getByLabel("SEO-заголовок")).toHaveValue(seoTitle, { timeout: 15000 });
  await expect(page.getByLabel("SEO-описание")).toHaveValue(seoDesc);

  const got = await trpc(page, "entry.get", { id: entry.id }, true);
  expect(got.op.result?.data.json).toMatchObject({ seoTitle, seoDescription: seoDesc });
});

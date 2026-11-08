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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { message: string } }>;
  return { status: r.status(), op: j[0] };
}

// Фильтры коллекции: поиск по title + фильтр по статусу.
test("collection filters: search + status", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const t1 = `E2E filtA ${ts}`;
  const t2 = `E2E filtB ${ts}`;
  const r1 = await trpc(page, "entry.create", { collectionId: posts!.id, title: t1 });
  const r2 = await trpc(page, "entry.create", { collectionId: posts!.id, title: t2 });
  const id1 = (r1.op.result?.data.json as { id: string }).id;
  const id2 = (r2.op.result?.data.json as { id: string }).id;
  await trpc(page, "entry.publish", { id: id1 });

  try {
    await page.goto("/collections/posts");
    await page.getByPlaceholder("Поиск по title/slug…").fill(`filtA ${ts}`);
    await expect(page.getByRole("link", { name: new RegExp(t1) }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: new RegExp(t2) })).toBeHidden({ timeout: 10000 });

    await page.getByPlaceholder("Поиск по title/slug…").fill("");
    await page.locator("#filter-status").selectOption("PUBLISHED");
    await expect(page.getByRole("link", { name: new RegExp(t1) }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("link", { name: new RegExp(t2) })).toBeHidden({ timeout: 10000 });
  } finally {
    await trpc(page, "entry.remove", { id: id1 }).catch(() => {});
    await trpc(page, "entry.remove", { id: id2 }).catch(() => {});
  }
});

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

// Теги end-to-end: setTags -> фильтр по тегу показывает только меченую запись.
test("tags filter shows only tagged entry", async ({ page }) => {
  const ts = Date.now();
  const tag = `e2e-tag-${ts}`;
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const mk = async (title: string) => {
    const r = await trpc(page, "entry.create", { collectionId: posts!.id, title });
    return (r.op.result?.data.json as { id: string }).id;
  };
  const taggedId = await mk(`E2E tagged ${ts}`);
  await mk(`E2E plain ${ts}`);
  await trpc(page, "entry.setTags", { entryId: taggedId, tags: [tag] });

  await page.goto("/collections/posts");
  await page.getByPlaceholder("Фильтр по тегу…").fill(tag);
  await expect(page.getByRole("link", { name: new RegExp(`E2E tagged ${ts}`) })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("link", { name: new RegExp(`E2E plain ${ts}`) })).toBeHidden({ timeout: 10000 });

  // Чистим за собой
  await trpc(page, "entry.remove", { id: taggedId });
});

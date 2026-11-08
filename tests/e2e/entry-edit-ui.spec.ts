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

// Редактирование через модалку EntryForm: title меняется, ревизий +1.
test("entry edit via UI modal + revision count", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E editmodal ${ts}` });
  const id = (created.op as unknown as { result?: { data: { json: { id: string } } } }).result!.data.json.id;
  const before = await trpc(page, "entry.get", { id }, true);
  const revBefore = ((before.op.result?.data.json as { revisions: unknown[] }).revisions ?? []).length;

  await page.goto("/collections/posts");
  const row = page.locator("tbody tr", { hasText: `E2E editmodal ${ts}` });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Ред.", exact: true }).click();

  const newTitle = `E2E editedmodal ${ts}`;
  await page.locator("#entry-title").fill(newTitle);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("link", { name: newTitle }).first()).toBeVisible({ timeout: 15000 });

  const after = await trpc(page, "entry.get", { id }, true);
  const got = after.op.result?.data.json as { title: string; revisions: unknown[] };
  expect(got.title).toBe(newTitle);
  expect(got.revisions.length).toBe(revBefore + 1);

  await trpc(page, "entry.remove", { id });
});

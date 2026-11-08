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

// ⌘K-палитра: поиск записи -> Enter -> переход в builder.
test("palette finds entry and navigates", async ({ page }) => {
  const ts = Date.now();
  const title = `E2E palette ${ts}`;
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title });
  const entry = created.op.result?.data.json as { id: string };
  expect(entry.id).toBeTruthy();

  await page.goto("/collections");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  const box = page.getByRole("combobox");
  await expect(box).toBeVisible({ timeout: 10000 });
  await box.fill(title);
  const option = page.getByRole("option", { name: new RegExp(title) }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/entries/${entry.id}`), { timeout: 15000 });

  // Чистим за собой, чтобы не засорять shared e2e.db
  await trpc(page, "entry.remove", { id: entry.id });
});

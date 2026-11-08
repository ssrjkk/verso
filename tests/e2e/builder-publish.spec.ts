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

// Кнопка «Опубликовать» в builder: статус + publishedAt.
test("builder publish button works", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E pub ${ts}` });
  const id = (created.op.result?.data.json as { id: string }).id;

  await page.goto(`/entries/${id}`);
  await expect(page.getByRole("button", { name: "Опубликовать" })).toBeVisible({ timeout: 15000 });
  const pub = page.waitForResponse(/entry\.publish/, { timeout: 15000 });
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await pub;
  const got = await trpc(page, "entry.get", { id }, true);
  const full = got.op.result?.data.json as { status: string; publishedAt: string | null };
  expect(full.status).toBe("PUBLISHED");
  expect(full.publishedAt).not.toBeNull();
});

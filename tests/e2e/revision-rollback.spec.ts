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

// Откат ревизии: T1 -> T2 -> откат к v1 -> снова T1.
test("revision rollback restores v1", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const t1 = `E2E rev1 ${ts}`;
  const t2 = `E2E rev2 ${ts}`;
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: t1 });
  const entry = created.op.result?.data.json as { id: string };
  await trpc(page, "entry.update", { id: entry.id, title: t2, changeNote: "вторая версия" });

  await page.goto(`/entries/${entry.id}`);
  await expect(page.getByText("История ревизий")).toBeVisible({ timeout: 15000 });
  const v1 = page.getByRole("button", { name: /Откатить/ });
  await expect(v1).toBeVisible({ timeout: 15000 });
  await v1.click();
  await expect(page.getByText(t1).first()).toBeVisible({ timeout: 15000 });

  const got = await trpc(page, "entry.get", { id: entry.id }, true);
  expect((got.op.result?.data.json as { title: string }).title).toBe(t1);
});

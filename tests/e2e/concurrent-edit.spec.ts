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

// Два редактора: B сохраняется первым, A со stale-версией получает CONFLICT, данные B целы.
test("concurrent edit shows CONFLICT, no silent overwrite", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E race ${ts}` });
  const id = (created.op.result?.data.json as { id: string }).id;
  const titleB = `E2E race B ${ts}`;

  await page.goto(`/entries/${id}`);
  await expect(page.getByLabel("SEO-заголовок")).toBeVisible({ timeout: 15000 });

  // B сохраняет напрямую (версия убегает вперёд)
  const updB = await trpc(page, "entry.update", { id, title: titleB });
  expect((updB.op.result?.data.json as { title: string }).title).toBe(titleB);

  // A жмёт «Сохранить SEO» со stale-версией -> CONFLICT, не тихая перезапись
  await page.getByLabel("SEO-заголовок").fill(`E2E race A ${ts}`);
  await page.getByRole("button", { name: "Сохранить SEO" }).click();
  await expect(page.getByText(/Обновите страницу|CONFLICT|изменена другим/)).toBeVisible({ timeout: 10000 });

  const got = await trpc(page, "entry.get", { id }, true);
  expect((got.op.result?.data.json as { title: string }).title).toBe(titleB);

  await trpc(page, "entry.remove", { id });
});

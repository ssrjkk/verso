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

// Редактирование через BlockEditor: смена заголовка, скрытие блока.
test("builder edit + visibility", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E edit ${ts}` });
  const entry = created.op.result?.data.json as { id: string };

  await page.goto(`/entries/${entry.id}`);
  await page.getByRole("button", { name: /Hero/ }).first().click();
  await page.getByRole("button", { name: /Редактировать/ }).first().click();
  const newTitle = `E2E edited ${ts}`;
  await page.getByLabel("Заголовок", { exact: true }).first().fill(newTitle);
  const saveP = page.waitForResponse(/block\.upsertMany/, { timeout: 15000 });
  await page.getByRole("button", { name: /Сохранить блоки/ }).click();
  await saveP;
  await expect(page.locator("section.print-clean").getByText(newTitle)).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.locator("section.print-clean").getByText(newTitle)).toBeVisible({ timeout: 15000 });
  const listed = await trpc(page, "block.list", { entryId: entry.id }, true);
  expect((listed.op.result?.data.json as unknown[])).toHaveLength(1);
  const revs = await trpc(page, "entry.get", { id: entry.id }, true);
  expect(((revs.op.result?.data.json as { revisions: unknown[] }).revisions.length)).toBeGreaterThanOrEqual(1);

  // Скрываем блок — превью пустеет, строка остаётся
  await page.getByRole("button", { name: /Редактировать/ }).first().click();
  await page.getByTitle(/Скрыть|Показать/).first().click();
  const saveP2 = page.waitForResponse(/block\.upsertMany/, { timeout: 15000 });
  await page.getByRole("button", { name: /Сохранить блоки/ }).click();
  await saveP2;
  await expect(page.getByText("Нет видимых блоков")).toBeVisible({ timeout: 15000 });
});

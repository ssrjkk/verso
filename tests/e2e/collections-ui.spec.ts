import { test, expect, type Page } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

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

// Полный жизненный цикл через UI: коллекция -> запись -> удаление записи -> удаление коллекции.
test("collections UI lifecycle", async ({ page }) => {
  const ts = Date.now();
  const colName = `E2E col ${ts}`;
  const colSlug = `e2e-col-${ts}`;
  const entryTitle = `E2E entry ${ts}`;

  await page.goto("/collections");
  await page.getByPlaceholder("Название коллекции").fill(colName);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("link", { name: new RegExp(colName) }).first()).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: new RegExp(colName) }).first().click();
  await expect(page).toHaveURL(new RegExp(`/collections/${colSlug}`), { timeout: 15000 });
  await page.getByRole("button", { name: /создать запись/i }).click();
  await page.locator("#entry-title").fill(entryTitle);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("link", { name: entryTitle })).toBeVisible({ timeout: 15000 });

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByRole("link", { name: entryTitle })).toBeHidden({ timeout: 10000 });

  await page.goto("/collections");
  await expect(page.getByRole("link", { name: new RegExp(colName) }).first()).toBeVisible({ timeout: 15000 });
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: `Удалить ${colName}` }).click();
  await expect(page.getByRole("link", { name: new RegExp(colName) })).toBeHidden({ timeout: 10000 });

  // Подтверждение на уровне API: коллекции больше нет
  const cols = await trpc(page, "collection.list", undefined, true);
  const slugs = ((cols.op.result?.data.json ?? []) as Array<{ slug: string }>).map((c) => c.slug);
  expect(slugs).not.toContain(colSlug);
});

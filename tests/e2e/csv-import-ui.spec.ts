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

// Импорт CSV через UI-кнопку в карточке коллекции: файл -> счётчик -> записи в таблице.
test("csv import via UI button", async ({ page }) => {
  const ts = Date.now();
  const csv = `title,slug\nE2E csvui A ${ts},e2e-csvui-a-${ts}\nE2E csvui B ${ts},e2e-csvui-b-${ts}\n`;
  await page.goto("/collections");
  const card = page.locator("div.rounded-2xl.border", { has: page.locator('a[href="/collections/posts"]') }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.locator('input[type="file"]').setInputFiles({
    name: `import-${ts}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf-8"),
  });
  await expect(card.getByText(/Импортировано: 2, пропущено: 0/)).toBeVisible({ timeout: 15000 });

  await page.goto("/collections/posts");
  for (const letter of ["A", "B"]) {
    await expect(page.getByRole("link", { name: new RegExp(`E2E csvui ${letter} ${ts}`) }).first()).toBeVisible({ timeout: 10000 });
  }
  // Чистим за собой (entry.remove доступен MANAGER)
  const listed = await trpc(page, "entry.list", { collectionId: undefined, search: "E2E csvui" }, true);
  const found = ((listed.op.result?.data.json ?? []) as Array<{ id: string; title: string }>)
    .filter((e) => e.title.includes(`${ts}`));
  for (const e of found) {
    await trpc(page, "entry.remove", { id: e.id });
  }
});

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

// EntryForm: кривой JSON не уходит на сервер, ошибка видна, модалка открыта.
test("entry form rejects invalid JSON", async ({ page }) => {
  await page.goto("/collections/posts");
  await page.getByRole("button", { name: /создать запись/i }).click();
  await page.locator("#entry-title").fill(`E2E badjson ${Date.now()}`);
  await page.locator("#entry-fields").fill("{not valid json");
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 10000 });
  // Модалка не закрылась — форма всё ещё на экране
  await expect(page.locator("#entry-title")).toBeVisible({ timeout: 5000 });
});

import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/editor.json" });

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

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

// API-ключи через UI: выпуск (raw виден) -> отзыв (исчез из списка).
test("apikey UI issue and revoke", async ({ page }) => {
  const ts = Date.now();
  const name = `E2E key ${ts}`;
  await page.goto("/settings");
  await page.getByPlaceholder("Название ключа…").fill(name);
  await page.getByRole("button", { name: /Выпустить/ }).click();
  const rawBox = page.locator("code").first();
  await expect(rawBox).toBeVisible({ timeout: 15000 });
  expect(await rawBox.textContent()).toContain("vrs_live_");

  page.once("dialog", (d) => void d.accept());
  const row = page.locator("div", { hasText: name }).last();
  await row.getByRole("button", { name: "Отозвать" }).click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 15000 });

  // Подтверждение на уровне API: ключа больше нет
  const listed = await trpc(page, "apiKey.list", undefined, true);
  const names = ((listed.op.result?.data.json ?? []) as Array<{ name: string }>).map((k) => k.name);
  expect(names).not.toContain(name);
});

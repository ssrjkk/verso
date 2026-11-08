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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { message: string } }>;
  return { status: r.status(), op: j[0] };
}

// Expiry через prompt(): дата ставится и снимается, API подтверждает.
test("apikey expiry via UI prompt", async ({ page }) => {
  const ts = Date.now();
  const name = `E2E exp ${ts}`;
  await page.goto("/settings");
  await page.getByPlaceholder("Название ключа…").fill(name);
  await page.getByRole("button", { name: "Выпустить" }).click();
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });

  const row = page.locator("div.rounded-xl", { hasText: name }).first();
  page.once("dialog", (d) => void d.accept("2027-05-01"));
  await row.getByRole("button", { name: "Expiry" }).click();
  await expect(row.getByText(/2027/)).toBeVisible({ timeout: 10000 });

  const listed = await trpc(page, "apiKey.list", undefined, true);
  const keys = (listed.op.result?.data.json ?? []) as Array<{ id: string; name: string; expiresAt: string | null }>;
  const key = keys.find((k) => k.name === name)!;
  expect(new Date(key.expiresAt!).getFullYear()).toBe(2027);

  page.once("dialog", (d) => void d.accept(""));
  await row.getByRole("button", { name: "Expiry" }).click();
  await expect(row.getByText(/бессрочный/)).toBeVisible({ timeout: 10000 });

  page.once("dialog", (d) => void d.accept());
  await row.getByRole("button", { name: "Отозвать" }).click();
  await expect(page.getByText(name)).toBeHidden({ timeout: 10000 });
});

import { test, expect } from "@playwright/test";

// Сквозной жизненный цикл: вход -> коллекция -> запись -> публикация -> sitemap.
// + скан консольных ошибок на ключевых экранах.
test("publish lifecycle + console clean", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));

  const ts = Date.now();
  const colName = `E2E ${ts}`;
  const colSlug = `e2e-${ts}`;
  const entryTitle = `E2E entry ${ts}`;

  // 1. Вход админом (ADMIN может всё, включая создание коллекций)
  await page.goto("/sign-in");
  await page.locator("#signin-email").fill("test@corvid.dev");
  await page.locator("#signin-password").fill("password123");
  await page.locator("form button").first().click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

  // 2. Коллекция через tRPC поверх той же сессии
  const created = await page.request.post("/api/trpc/collection.create?batch=1", {
    headers: { "content-type": "application/json" },
    data: { "0": { json: { name: colName } } },
  });
  expect(created.ok()).toBeTruthy();
  const cjson = await created.json();
  expect(cjson[0].result.data.json.slug).toBe(colSlug);

  // 3. Запись через UI модалку
  await page.goto(`/collections/${colSlug}`);
  await page.getByRole("button", { name: /создать запись/i }).click();
  await page.locator("#entry-title").fill(entryTitle);
  await page.getByRole("button", { name: "Создать", exact: true }).click();
  await expect(page.getByRole("link", { name: entryTitle })).toBeVisible({ timeout: 15000 });

  // 4. Публикация быстрым действием
  await page.getByRole("button", { name: /опубликовать/i }).first().click();
  const row = page.locator("tbody tr", { hasText: entryTitle });
  await expect(row.getByText("PUBLISHED")).toBeVisible({ timeout: 15000 });

  // 5. Попало в sitemap
  const sm = await page.request.get("/api/sitemap.xml");
  expect(sm.ok()).toBeTruthy();
  expect(await sm.text()).toContain(colSlug);

  // 6. Скан экранов без консольных ошибок
  for (const p of ["/dashboard", "/board", "/media", "/collections"]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/editor.json" });

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Счастливый путь загрузки: 201, файл в списке, статистика выросла.
test("upload happy path: png 201 + виден в медиатеке", async ({ page }) => {
  await page.goto("/media");
  await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 15000 });

  const before = await page.request.get("/api/trpc/media.stats?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D");
  const beforeJson = (await before.json()) as Array<{ result: { data: { json: { total: number } } } }>;
  const totalBefore = beforeJson[0].result.data.json.total;

  const fname = `e2e-${Date.now()}.png`;
  const upP = page.waitForResponse(
    (r) => r.url().includes("/api/upload") && r.request().method() === "POST",
    { timeout: 15000 },
  );
  await page.locator('input[type="file"]').setInputFiles({ name: fname, mimeType: "image/png", buffer: PNG_1PX });
  const up = await upP;
  expect(up.status()).toBe(201);

  await expect(page.getByText(fname, { exact: true }).first()).toBeVisible({ timeout: 15000 });
  const after = await page.request.get("/api/trpc/media.stats?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D");
  const afterJson = (await after.json()) as Array<{ result: { data: { json: { total: number } } } }>;
  expect(afterJson[0].result.data.json.total).toBeGreaterThan(totalBefore);
});

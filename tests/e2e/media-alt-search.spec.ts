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
  return r;
}

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mPz8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// Медиатека: поиск фильтрует, alt сохраняется и переживает reload.
test("media alt persists + search filters", async ({ page, browser }) => {
  const ts = Date.now();
  const fname = `e2e-alt-${ts}.png`;
  const alt = `Alt E2E ${ts}`;
  await page.goto("/media");
  await page.locator('input[type="file"]').setInputFiles({ name: fname, mimeType: "image/png", buffer: PNG_1PX });
  await expect(page.getByText(fname, { exact: true }).first()).toBeVisible({ timeout: 15000 });

  // Поиск: точное имя находит, мусор — пустое состояние
  await page.getByPlaceholder("Поиск…").fill(fname);
  await expect(page.getByText(fname, { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("Поиск…").fill(`no-such-file-${ts}`);
  await expect(page.getByText("Ничего не найдено")).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder("Поиск…").fill("");

  // Alt: задать через blur, пережить reload
  const altInput = page.getByLabel(`Alt-текст для ${fname}`, { exact: true });
  await altInput.fill(alt);
  await altInput.press("Tab");
  await page.waitForTimeout(1500);
  await page.reload();
  const persisted = page.locator(`input[aria-label="Alt-текст для ${fname}"]`);
  await expect(persisted).toHaveValue(alt, { timeout: 15000 });

  // Чистим за собой через admin-контекст (media.remove — ADMIN-only).
  const actx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  const apage = await actx.newPage();
  try {
    const listed = await trpc(apage, "media.list", { search: fname }, true);
    const found = ((await listed.json()) as Array<{ result: { data: { json: Array<{ id: string }> } } }>)[0].result.data.json;
    expect(found, "uploaded asset found").toHaveLength(1);
    const del = await trpc(apage, "media.remove", { id: found[0].id });
    expect(del.status()).toBe(200);
  } finally {
    await actx.close();
  }
  await page.reload();
  await expect(page.getByText(fname, { exact: true })).toBeHidden({ timeout: 10000 });
});

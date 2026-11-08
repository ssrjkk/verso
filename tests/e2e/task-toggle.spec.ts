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

// Чекбокс задачи: DONE переживает reload.
test("task toggle persists", async ({ page }) => {
  const ts = Date.now();
  const title = `E2E task toggle ${ts}`;
  await page.goto("/calendar");
  await page.getByPlaceholder("Название задачи").fill(title);
  await page.getByRole("button", { name: "Создать задачу" }).click();
  const box = page.getByRole("checkbox", { name: new RegExp(title) }).first();
  await expect(box).toBeVisible({ timeout: 15000 });
  await box.click();
  await expect(box).toBeChecked({ timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.reload();
  const listed = await trpc(page, "task.list", undefined, true);
  const tasks = (listed.op.result?.data.json ?? []) as Array<{ title: string; status: string }>;
  expect(tasks.find((t) => t.title === title)?.status).toBe("DONE");
});

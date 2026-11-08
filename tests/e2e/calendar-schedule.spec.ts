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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { message: string } } }>;
  return { status: r.status(), op: j[0] };
}

function localDay(offsetDays: number): { key: string; iso: string } {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    iso: d.toISOString(),
  };
}

// Запланированная запись видна в ячейке дня + задача создаётся через UI.
test("calendar shows scheduled entry, task can be created", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const title = `E2E sched ${ts}`;
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title });
  const entry = created.op.result?.data.json as { id: string };
  const tomorrow = localDay(1);
  await trpc(page, "entry.update", { id: entry.id, status: "SCHEDULED", scheduledFor: tomorrow.iso });

  await page.goto("/calendar");
  const cell = page.locator("button", { hasText: title }).first();
  await expect(cell).toBeVisible({ timeout: 15000 });
  await cell.click();
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible({ timeout: 10000 });

  const taskTitle = `E2E task ${ts}`;
  await page.getByPlaceholder("Название задачи").fill(taskTitle);
  await page.getByRole("button", { name: "Создать задачу" }).click();
  await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 15000 });
});

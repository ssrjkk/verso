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

// Редактирование через модалку EntryForm: title меняется, ревизий +1.
test("entry edit via UI modal + revision count", async ({ page }) => {
  // Полный прогон идёт после десятков страниц и тяжёлых axe-проверок:
  // 30 с на открытие модалки и сохранение — мало, 60 с не ослабляет проверки.
  test.setTimeout(60_000);
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title: `E2E editmodal ${ts}` });
  const id = (created.op as unknown as { result?: { data: { json: { id: string } } } }).result!.data.json.id;
  const before = await trpc(page, "entry.get", { id }, true);
  const revBefore = ((before.op.result?.data.json as { revisions: unknown[] }).revisions ?? []).length;

  await page.goto("/collections/posts");
  const row = page.locator("tbody tr", { hasText: `E2E editmodal ${ts}` });
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.getByRole("button", { name: "Ред.", exact: true }).click();

  // Явно дожидаемся модалки: fill не должен соревноваться с её появлением.
  await expect(page.getByRole("heading", { name: "Редактировать запись" })).toBeVisible();
  const titleInput = page.locator("#entry-title");
  await expect(titleInput).toBeEditable();

  const newTitle = `E2E editedmodal ${ts}`;
  await titleInput.fill(newTitle);
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("link", { name: newTitle }).first()).toBeVisible({ timeout: 15000 });

  const after = await trpc(page, "entry.get", { id }, true);
  const got = after.op.result?.data.json as { title: string; revisions: unknown[] };
  expect(got.title).toBe(newTitle);
  expect(got.revisions.length).toBe(revBefore + 1);

  await trpc(page, "entry.remove", { id });
});

// Сохранение блоков — такая же правка контента: ревизия и снапшот должны
// появиться в той же транзакции, иначе история версий врёт о состоянии страницы.
test("block save creates revision with block snapshot", async ({ page }) => {
  test.setTimeout(60_000);
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", {
    collectionId: posts!.id,
    title: `E2E blocks ${ts}`,
  });
  const id = (created.op as unknown as { result?: { data: { json: { id: string } } } })
    .result!.data.json.id;
  const before = await trpc(page, "entry.get", { id }, true);
  const revBefore = ((before.op.result?.data.json as { revisions: unknown[] }).revisions ?? []).length;

  const saved = await trpc(page, "block.upsertMany", {
    entryId: id,
    blocks: [
      {
        type: "RICH_TEXT",
        order: 0,
        isVisible: true,
        propsJson: JSON.stringify({ text: `block ${ts}` }),
      },
    ],
  });
  expect(saved.op.error).toBeUndefined();

  const after = await trpc(page, "entry.get", { id }, true);
  const revisions = (after.op.result?.data.json as {
    revisions: Array<{ snapshotJson: string }>;
  }).revisions;
  expect(revisions.length, "ревизия за сохранение блоков").toBe(revBefore + 1);
  const snapshot = JSON.parse(revisions[0].snapshotJson) as {
    blocks: Array<{ type: string; propsJson: string }>;
  };
  expect(snapshot.blocks).toHaveLength(1);
  expect(snapshot.blocks[0]).toMatchObject({ type: "RICH_TEXT" });
  expect(snapshot.blocks[0].propsJson).toContain(`block ${ts}`);

  await trpc(page, "entry.remove", { id });
});

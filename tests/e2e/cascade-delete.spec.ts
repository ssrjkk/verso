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

// Каскадное удаление: entry.remove чистит блоки+ревизии, collection.remove чистит записи.
// Сироты в БД недопустимы.
test("cascade delete leaves no orphans", async ({ page }) => {
  const ts = Date.now();
  const col = await trpc(page, "collection.create", { name: `E2E cas ${ts}` });
  const collection = col.op.result?.data.json as { id: string; slug: string };
  expect(collection.id).toBeTruthy();

  const en = await trpc(page, "entry.create", { collectionId: collection.id, title: `E2E cas entry ${ts}` });
  const entry = en.op.result?.data.json as { id: string };
  await trpc(page, "block.upsertMany", {
    entryId: entry.id,
    blocks: [{ type: "HERO", order: 0, isVisible: true, propsJson: "{}" }],
  });

  // Удаление записи -> блоки и ревизии исчезают, сама запись -> null
  await trpc(page, "entry.remove", { id: entry.id });
  const blocks = await trpc(page, "block.list", { entryId: entry.id }, true);
  expect((blocks.op.result?.data.json as unknown[])).toHaveLength(0);
  const gone = await trpc(page, "entry.get", { id: entry.id }, true);
  expect(gone.op.result?.data.json).toBeNull();

  // Удаление коллекции -> её записи исчезают
  const en2 = await trpc(page, "entry.create", { collectionId: collection.id, title: `E2E cas entry2 ${ts}` });
  const entry2 = (en2.op.result?.data.json as { id: string }).id;
  await trpc(page, "collection.remove", { id: collection.id });
  const gone2 = await trpc(page, "entry.get", { id: entry2 }, true);
  expect(gone2.op.result?.data.json).toBeNull();
  const goneCol = await trpc(page, "collection.get", { slug: `e2e-cas-${ts}` }, true);
  expect(goneCol.op.result?.data.json).toBeNull();
});

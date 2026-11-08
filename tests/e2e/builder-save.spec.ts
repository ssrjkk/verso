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

// Конструктор: добавить HERO-блок через UI, сохранить, reload, блок и превью на месте.
test("builder save: HERO persists + preview renders", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  const created = await trpc(page, "entry.create", {
    collectionId: posts!.id,
    title: `E2E builder ${ts}`,
  });
  const entry = created.op.result?.data.json as { id: string };
  expect(entry.id).toBeTruthy();

  await page.goto(`/entries/${entry.id}`);
  await expect(page.getByRole("button", { name: /Hero/ }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Hero/ }).first().click();
  await expect(page.getByText(/Hero/, { exact: false }).first()).toBeVisible();

  const saveRespP = page.waitForResponse(/block\.upsertMany/, { timeout: 15000 });
  await page.getByRole("button", { name: /Сохранить блоки/ }).click();
  const saveResp = await saveRespP;
  expect(saveResp.ok()).toBeTruthy();

  const listed = await trpc(page, "block.list", { entryId: entry.id }, true);
  const blocks = listed.op.result?.data.json as Array<{ type: string; propsJson: string }>;
  expect(blocks).toHaveLength(1);
  expect(blocks[0].type).toBe("HERO");
  const heroTitle = (JSON.parse(blocks[0].propsJson) as { title: string }).title;
  expect(heroTitle).toBeTruthy();

  await page.reload();
  await expect(page.getByText(heroTitle)).toBeVisible({ timeout: 15000 });
});

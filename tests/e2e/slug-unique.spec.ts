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

// Дубль названия: вторая запись получает slug-2 вместо P2002/500.
test("duplicate titles get unique slugs", async ({ page }) => {
  const ts = Date.now();
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const title = `E2E dup ${ts}`;
  const r1 = await trpc(page, "entry.create", { collectionId: posts!.id, title });
  const r2 = await trpc(page, "entry.create", { collectionId: posts!.id, title });
  const s1 = (r1.op.result?.data.json as { slug: string }).slug;
  const s2 = (r2.op.result?.data.json as { slug: string }).slug;
  expect(s1).toBe(`e2e-dup-${ts}`);
  expect(s2).toBe(`e2e-dup-${ts}-2`);
  const e1 = (r1.op.result?.data.json as { id: string }).id;
  const e2 = (r2.op.result?.data.json as { id: string }).id;
  await trpc(page, "entry.remove", { id: e1 });
  await trpc(page, "entry.remove", { id: e2 });
});

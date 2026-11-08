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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

test.describe.serial("redirects lifecycle (serving NOT implemented — data only)", () => {
  const from = `/e2e-old-${Date.now()}`;

  test("editor upsert + toggle", async ({ page }) => {
    const up = await trpc(page, "seo.upsertRedirect", { fromPath: from, toPath: "/e2e-new" });
    expect(up.op.error).toBeUndefined();
    const listed = await trpc(page, "seo.redirects", undefined, true);
    const rows = listed.op.result?.data.json as Array<{ id: string; fromPath: string; isActive: boolean }>;
    const row = rows.find((x) => x.fromPath === from);
    expect(row, "redirect in list").toBeTruthy();
    const toggled = await trpc(page, "seo.toggleRedirect", { id: row!.id, isActive: false });
    expect(toggled.op.error).toBeUndefined();
    const relisted = await trpc(page, "seo.redirects", undefined, true);
    const after = ((relisted.op.result?.data.json ?? []) as typeof rows).find((x) => x.fromPath === from);
    expect(after?.isActive).toBe(false);
  });

  test("editor cannot delete, admin cleanup", async ({ page, browser }) => {
    const listed = await trpc(page, "seo.redirects", undefined, true);
    const rows = listed.op.result?.data.json as Array<{ id: string; fromPath: string }>;
    const row = rows.find((x) => x.fromPath === from)!;
    const del = await trpc(page, "seo.removeRedirect", { id: row.id });
    expect(del.op.error?.json.data.code).toBe("FORBIDDEN");

    const actx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
    const apage = await actx.newPage();
    try {
      const adel = await trpc(apage, "seo.removeRedirect", { id: row.id });
      expect(adel.op.error).toBeUndefined();
    } finally {
      await actx.close();
    }
  });
});

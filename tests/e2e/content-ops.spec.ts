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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string }; message: string } } }>;
  return { status: r.status(), op: j[0] };
}

test.describe.serial("manager ops + negative auth", () => {
  test("moveStage DRAFT->IN_REVIEW->PUBLISHED->ARCHIVED", async ({ page }) => {
    const cols = await trpc(page, "collection.list", undefined, true);
    const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
      .find((c) => c.slug === "posts");
    expect(posts, "seed collection posts").toBeTruthy();

    const title = `E2E stage ${Date.now()}`;
    const created = await trpc(page, "entry.create", { collectionId: posts!.id, title });
    const entry = created.op.result?.data.json as { id: string; status: string };
    expect(entry.status).toBe("DRAFT");

    const stages = await trpc(page, "workflow.stages", undefined, true);
    const byTarget = new Map(
      ((stages.op.result?.data.json ?? []) as Array<{ id: string; targetState: string }>).map((s) => [s.targetState, s.id]),
    );
    for (const [target, wantStatus] of [["IN_REVIEW", "IN_REVIEW"], ["PUBLISHED", "PUBLISHED"], ["ARCHIVED", "ARCHIVED"]] as const) {
      const mv = await trpc(page, "entry.moveStage", { entryId: entry.id, stageId: byTarget.get(target)! });
      expect(mv.op.error, `moveStage ${target}`).toBeUndefined();
      expect(mv.op.result?.data.json).toMatchObject({ status: wantStatus });
    }
    const got = await trpc(page, "entry.get", { id: entry.id }, true);
    const full = got.op.result?.data.json as { status: string; publishedAt: string };
    expect(full.status).toBe("ARCHIVED");
    expect(new Date(full.publishedAt).getTime()).not.toBeNaN();
  });

  test("CSV roundtrip: export -> import = 0 новых, без дублей", async ({ page }) => {
    const cols = await trpc(page, "collection.list", undefined, true);
    const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
      .find((c) => c.slug === "posts");
    const ts = Date.now();
    for (const t of [`E2E csv a ${ts}`, `E2E csv b ${ts}`]) {
      const c = await trpc(page, "entry.create", { collectionId: posts!.id, title: t });
      expect(c.op.error).toBeUndefined();
    }
    const exp = await trpc(page, "collection.exportCsv", { collectionId: posts!.id }, true);
    const csv = exp.op.result?.data.json as string;
    expect(csv).toContain(`E2E csv a ${ts}`);
    const imp = await trpc(page, "collection.importCsv", { collectionId: posts!.id, csv });
    expect(imp.op.result?.data.json).toMatchObject({ imported: 0 });
    expect((imp.op.result?.data.json as { skipped: number }).skipped).toBeGreaterThanOrEqual(2);
  });

  test("неверный пароль: role=alert, без редиректа", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto("/sign-in");
      await page.locator("#signin-email").fill("editor@corvid.dev");
      await page.locator("#signin-password").fill("wrong-password-123");
      await page.locator("form button").first().click();
      await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveURL(/sign-in/);
    } finally {
      await ctx.close();
    }
  });
});

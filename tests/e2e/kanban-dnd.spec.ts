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

// Настоящий drag-and-drop карточки между колонками Kanban (dnd-kit PointerSensor).
test("kanban dnd: перетаскивание меняет статус", async ({ page }) => {
  const ts = Date.now();
  const title = `E2E dnd ${ts}`;
  const cols = await trpc(page, "collection.list", undefined, true);
  const posts = ((cols.op.result?.data.json ?? []) as Array<{ id: string; slug: string }>)
    .find((c) => c.slug === "posts");
  expect(posts, "seed posts").toBeTruthy();
  const created = await trpc(page, "entry.create", { collectionId: posts!.id, title });
  const entry = created.op.result?.data.json as { id: string };
  expect(entry.id).toBeTruthy();

  const stages = await trpc(page, "workflow.stages", undefined, true);
  const byTarget = new Map(
    ((stages.op.result?.data.json ?? []) as Array<{ id: string; targetState: string }>).map((s) => [s.targetState, s.id]),
  );
  await trpc(page, "entry.moveStage", { entryId: entry.id, stageId: byTarget.get("DRAFT")! });

  await page.goto("/board");
  const card = page.getByRole("link", { name: title });
  await expect(card).toBeVisible({ timeout: 15000 });
  const target = page.locator("span.truncate", { hasText: "На ревью" });
  await expect(target).toBeVisible();

  const sb = await card.boundingBox();
  const tb = await target.boundingBox();
  expect(sb && tb).toBeTruthy();
  const respP = page.waitForResponse(/moveStage/, { timeout: 15000 });
  await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(
      sb!.x + ((tb!.x + tb!.width / 2 - sb!.x) * i) / 12,
      sb!.y + ((tb!.y - sb!.y) * i) / 12,
      { steps: 2 },
    );
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const resp = await respP;
  expect(resp.ok()).toBeTruthy();

  const got = await trpc(page, "entry.get", { id: entry.id }, true);
  expect((got.op.result?.data.json as { status: string }).status).toBe("IN_REVIEW");
  const targetCol = page.locator("div.flex.min-h-\\[220px\\]", { hasText: "На ревью" }).first();
  await expect(targetCol.getByText(title)).toBeVisible({ timeout: 10000 });
});

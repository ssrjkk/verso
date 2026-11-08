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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { code: number; message: string; data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

const createdKeyIds: string[] = [];

async function createKey(page: Page, name: string, scope: "READ" | "READ_WRITE", expiresAt?: string) {
  const { op } = await trpc(page, "apiKey.create", { name, scope, ...(expiresAt ? { expiresAt } : {}) });
  const key = op.result?.data.json as { id: string; raw: string };
  expect(key.raw, "apiKey raw returned").toMatch(/^crv_live_/);
  createdKeyIds.push(key.id);
  return key;
}

test.describe.serial("v1 scope matrix + viewer ban", () => {
  test("admin: READ key GET 200 / POST 403", async ({ page }) => {
    const read = await createKey(page, `e2e-read-${Date.now()}`, "READ");
    const get = await page.request.get("/api/v1/posts", { headers: { "x-api-key": read.raw } });
    expect(get.status()).toBe(200);
    expect(await get.json()).toEqual({ data: expect.any(Array) });
    const post = await page.request.post("/api/v1/posts", {
      headers: { "x-api-key": read.raw, "content-type": "application/json" },
      data: { title: "Should not be created" },
    });
    expect(post.status()).toBe(403);
  });

  test("admin: READ_WRITE key POST 201, запись видна", async ({ page }) => {
    const rw = await createKey(page, `e2e-rw-${Date.now()}`, "READ_WRITE");
    const title = `E2E v1 ${Date.now()}`;
    const post = await page.request.post("/api/v1/posts", {
      headers: { "x-api-key": rw.raw, "content-type": "application/json" },
      data: { title },
    });
    expect(post.status()).toBe(201);
    const created = (await post.json()) as { data: { id: string; slug: string } };
    expect(created.data.id).toBeTruthy();
    const get = await page.request.get("/api/v1/posts", { headers: { "x-api-key": rw.raw } });
    expect(get.status()).toBe(200);
    // Черновик через v1 POST не публикуется -> в GET (только PUBLISHED) его нет, проверяем через tRPC
    const { op } = await trpc(page, "entry.get", { id: created.data.id }, true);
    expect(op.result?.data.json).toMatchObject({ title });
  });

  test("expired 403 / garbage 401 / missing 401", async ({ page }) => {
    const exp = await createKey(page, `e2e-exp-${Date.now()}`, "READ", new Date(Date.now() - 1000).toISOString());
    const r1 = await page.request.get("/api/v1/posts", { headers: { "x-api-key": exp.raw } });
    expect(r1.status()).toBe(403);
    expect(await r1.json()).toEqual({ error: "API key expired" });
    const r2 = await page.request.get("/api/v1/posts", { headers: { "x-api-key": "crv_live_garbage" } });
    expect(r2.status()).toBe(401);
    const r3 = await page.request.get("/api/v1/posts");
    expect(r3.status()).toBe(401);
  });

  test("viewer: tRPC create FORBIDDEN + upload 403", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: "tests/e2e/.auth/viewer.json" });
    const page = await ctx.newPage();
    try {
      const { op } = await trpc(page, "entry.create", { collectionId: "c", title: "X" });
      expect(op.error?.json.data.code).toBe("FORBIDDEN");
      const up = await page.request.post("/api/upload", {
        multipart: { file: { name: "v.png", mimeType: "image/png", buffer: Buffer.from([1, 2, 3]) } },
      });
      expect(up.status()).toBe(403);
    } finally {
      await ctx.close();
    }
  });

  test("cleanup: revoke keys", async ({ page }) => {
    for (const id of createdKeyIds) {
      const { op } = await trpc(page, "apiKey.revoke", { id });
      expect(op.error, `revoke ${id}`).toBeUndefined();
    }
    createdKeyIds.length = 0;
  });
});

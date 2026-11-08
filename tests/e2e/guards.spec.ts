import { test, expect } from "@playwright/test";

test("v1 without key -> 401 JSON", async ({ request }) => {
  const r = await request.get("/api/v1/posts");
  expect(r.status()).toBe(401);
  expect(await r.json()).toEqual({ error: "Unauthorized" });
});

test("sitemap -> 200 xml", async ({ request }) => {
  const r = await request.get("/api/sitemap.xml");
  expect(r.status()).toBe(200);
  expect(r.headers()["content-type"]).toContain("xml");
  expect(await r.text()).toContain("<urlset");
});

test("upload without session -> 403", async ({ request }) => {
  const r = await request.post("/api/upload", {
    multipart: {
      file: { name: "t.png", mimeType: "image/png", buffer: Buffer.from([1, 2, 3]) },
    },
  });
  expect(r.status()).toBe(403);
});

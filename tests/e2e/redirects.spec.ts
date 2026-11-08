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

type RedirectRow = { id: string; fromPath: string; toPath: string; isActive: boolean; hits: number };

async function rows(page: Page): Promise<RedirectRow[]> {
  const listed = await trpc(page, "seo.redirects", undefined, true);
  expect(listed.op.error).toBeUndefined();
  return (listed.op.result?.data.json ?? []) as RedirectRow[];
}

test.describe.serial("redirects: data lifecycle + proxy serving", () => {
  const ts = Date.now();
  const from = `/e2e-old-${ts}`;
  const to = "/e2e-new";

  test("editor upsert + toggle", async ({ page }) => {
    const up = await trpc(page, "seo.upsertRedirect", { fromPath: from, toPath: to });
    expect(up.op.error).toBeUndefined();
    const row = (await rows(page)).find((x) => x.fromPath === from);
    expect(row, "redirect in list").toBeTruthy();
    const toggled = await trpc(page, "seo.toggleRedirect", { id: row!.id, isActive: false });
    expect(toggled.op.error).toBeUndefined();
    const after = (await rows(page)).find((x) => x.fromPath === from);
    expect(after?.isActive).toBe(false);
  });

  test("proxy отдаёт 301 + Location и атомарно увеличивает hits", async ({ page }) => {
    const row = (await rows(page)).find((x) => x.fromPath === from)!;
    if (!row.isActive) {
      const on = await trpc(page, "seo.toggleRedirect", { id: row.id, isActive: true });
      expect(on.op.error).toBeUndefined();
    }

    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status(), "редирект должен исполняться proxy").toBe(301);
    const location = res.headers()["location"];
    expect(location, "Location обязателен").toBeTruthy();
    // Сервер отдаёт относительный Location — резолвим от base URL стенда.
    const target = new URL(location, "http://localhost:3100");
    expect(target.pathname).toBe(to);
    expect(target.origin).toBe("http://localhost:3100");

    // hits инкрементится сервером при фактической отдаче редиректа.
    await expect
      .poll(async () => (await rows(page)).find((x) => x.fromPath === from)?.hits, {
        timeout: 10000,
      })
      .toBe(1);
  });

  test("выключенный редирект -> 404, а не 301", async ({ page }) => {
    const row = (await rows(page)).find((x) => x.fromPath === from)!;
    const off = await trpc(page, "seo.toggleRedirect", { id: row.id, isActive: false });
    expect(off.op.error).toBeUndefined();
    const res = await page.request.get(from, { maxRedirects: 0 });
    expect(res.status()).toBe(404);
  });

  test("editor cannot delete, admin cleanup", async ({ page, browser }) => {
    const row = (await rows(page)).find((x) => x.fromPath === from)!;
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

test("open redirect, служебные пути и self-redirect отклоняются", async ({ page }) => {
  const ts = Date.now();
  const cases: Array<{ fromPath: string; toPath: string; label: string }> = [
    { label: "absolute", fromPath: `/e2e-bad-a-${ts}`, toPath: "https://evil.example/x" },
    { label: "protocol-relative", fromPath: `/e2e-bad-b-${ts}`, toPath: "//evil.example/x" },
    { label: "backslash", fromPath: `/e2e-bad-c-${ts}`, toPath: "/\\evil.example/x" },
    { label: "javascript", fromPath: `/e2e-bad-d-${ts}`, toPath: "javascript:alert(1)" },
    { label: "api target", fromPath: `/e2e-bad-e-${ts}`, toPath: "/api/users" },
    { label: "next target", fromPath: `/e2e-bad-f-${ts}`, toPath: "/_next/static/x.js" },
    { label: "api source", fromPath: `/api/e2e-bad-${ts}`, toPath: "/new" },
    // Точное совпадение со служебным путём: /sign-in-123 — обычная страница,
    // а вот сам /sign-in перекрывать нельзя.
    { label: "sign-in source", fromPath: "/sign-in", toPath: "/new" },
    { label: "source protocol-relative", fromPath: `//evil.example/e2e-${ts}`, toPath: "/new" },
    { label: "self", fromPath: `/e2e-bad-g-${ts}`, toPath: `/e2e-bad-g-${ts}` },
  ];
  for (const c of cases) {
    const res = await trpc(page, "seo.upsertRedirect", { fromPath: c.fromPath, toPath: c.toPath });
    expect(res.op.error?.json.data.code, c.label).toBe("BAD_REQUEST");
  }
});

test("циклы и цепочки длиннее 3 отклоняются", async ({ page, browser }) => {
  const ts = Date.now();
  const p = (n: string) => `/e2e-chain-${n}-${ts}`;
  const a = p("a");
  const b = p("b");
  const c = p("c");
  const d = p("d");
  const e = p("e");

  const actx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  const apage = await actx.newPage();
  try {
    expect((await trpc(page, "seo.upsertRedirect", { fromPath: a, toPath: b })).op.error).toBeUndefined();

    const loop = await trpc(page, "seo.upsertRedirect", { fromPath: b, toPath: a });
    expect(loop.op.error?.json.data.code, "2-cycle").toBe("BAD_REQUEST");

    expect((await trpc(page, "seo.upsertRedirect", { fromPath: b, toPath: c })).op.error).toBeUndefined();
    expect((await trpc(page, "seo.upsertRedirect", { fromPath: c, toPath: d })).op.error).toBeUndefined();

    const tooLong = await trpc(page, "seo.upsertRedirect", { fromPath: d, toPath: e });
    expect(tooLong.op.error?.json.data.code, "4-й хоп").toBe("BAD_REQUEST");

    // Созданные рёбра удаляются только администратором.
    for (const row of await rows(apage)) {
      if (row.fromPath.startsWith(`/e2e-chain-`)) {
        const del = await trpc(apage, "seo.removeRedirect", { id: row.id });
        expect(del.op.error).toBeUndefined();
      }
    }
  } finally {
    await actx.close();
  }
});

test("seo.incrementHit удалён: счётчик меняет только сервер", async ({ page }) => {
  const res = await trpc(page, "seo.incrementHit", { id: "whatever" });
  expect(res.op.error?.json.data.code, "публичной накрутки hits больше нет").toBe("NOT_FOUND");
});

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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

async function createKey(page: Page, name: string, scope: "READ" | "READ_WRITE") {
  const { op } = await trpc(page, "apiKey.create", { name, scope });
  expect(op.error).toBeUndefined();
  return op.result?.data.json as { id: string; raw: string };
}

test("v1: ?key= отклоняется даже с валидным ключом (только заголовки)", async ({ page }) => {
  const key = await createKey(page, `e2e-nokey-${Date.now()}`, "READ");
  const res = await page.request.get(`/api/v1/posts?key=${encodeURIComponent(key.raw)}`);
  expect(res.status(), "?key= больше не аутентифицирует").toBe(401);
});

test("v1: Authorization: Bearer работает как x-api-key", async ({ page }) => {
  const key = await createKey(page, `e2e-bearer-${Date.now()}`, "READ");
  const res = await page.request.get("/api/v1/posts", {
    headers: { authorization: `Bearer ${key.raw}` },
  });
  expect(res.status()).toBe(200);
});

test("v1: lastUsedAt обновляется не чаще раза в минуту", async ({ page }) => {
  const key = await createKey(page, `e2e-touch-${Date.now()}`, "READ");
  const readStamp = async () => {
    const { op } = await trpc(page, "apiKey.list", undefined, true);
    const keys = (op.result?.data.json ?? []) as Array<{ id: string; lastUsedAt: string | null }>;
    return keys.find((k) => k.id === key.id)?.lastUsedAt ?? null;
  };
  expect(await readStamp()).toBeNull();
  expect((await page.request.get("/api/v1/posts", { headers: { "x-api-key": key.raw } })).status()).toBe(200);
  const first = await readStamp();
  expect(first, "первое обращение фиксируется").toBeTruthy();
  expect((await page.request.get("/api/v1/posts", { headers: { "x-api-key": key.raw } })).status()).toBe(200);
  expect(await readStamp(), "повтор в пределах минуты не перезаписывает").toBe(first);
});

test("v1: превышение лимита → 429 + Retry-After", async ({ page }) => {
  const key = await createKey(page, `e2e-rl-${Date.now()}`, "READ");
  let limited = false;
  let retryAfter: string | null = null;
  // Бюджет 240/мин на IP: капаем до 260, чтобы лимит гарантированно сработал
  // даже с учётом расходов предыдущих тестов с того же IP.
  for (let i = 0; i < 260; i++) {
    const res = await page.request.get("/api/v1/posts", { headers: { "x-api-key": key.raw } });
    if (res.status() === 429) {
      limited = true;
      retryAfter = res.headers()["retry-after"];
      break;
    }
    expect(res.status(), `попытка ${i}`).toBe(200);
  }
  expect(limited, "лимит срабатывает").toBe(true);
  expect(Number(retryAfter), "Retry-After в секундах").toBeGreaterThan(0);
});

test("upload: контент без png-сигнатуры отклоняется (расширение/mime валидны)", async ({ page }) => {
  // Идёт ДО hammer-теста: у них общий бюджет на пользователя, а magic-отказ
  // требует свободного токена (проверка лимита — до валидации).
  const fake = Buffer.from("<html><script>alert(1)</script></html>");
  const res = await page.request.post("/api/upload", {
    multipart: {
      file: { name: "x.png", mimeType: "image/png", buffer: fake },
      folder: "root",
    },
  });
  expect(res.status()).toBe(400);
});

test("upload: превышение лимита → 429 + Retry-After", async ({ page, browser }) => {
  const tiny = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const createdIds: string[] = [];
  let limited = false;
  for (let i = 0; i < 80; i++) {
    const res = await page.request.post("/api/upload", {
      multipart: {
        file: { name: `rl-${i}.png`, mimeType: "image/png", buffer: tiny },
        folder: "root",
      },
    });
    if (res.status() === 429) {
      limited = true;
      expect(Number(res.headers()["retry-after"])).toBeGreaterThan(0);
      break;
    }
    expect(res.status(), `попытка ${i}`).toBe(201);
    const body = (await res.json()) as { asset: { id: string } };
    createdIds.push(body.asset.id);
  }
  expect(limited, "лимит загрузок срабатывает").toBe(true);
  // Чистим созданные ассеты (строки + файлы), чтобы не засорять стенд.
  const actx = await browser.newContext({ storageState: "tests/e2e/.auth/admin.json" });
  try {
    for (const id of createdIds) {
      await actx.request.post("/api/trpc/media.remove?batch=1", {
        headers: { "content-type": "application/json" },
        data: { "0": { json: { id } } },
      });
    }
  } finally {
    await actx.close();
  }
});

test("коллекция: переименование и описание из UI, slug read-only", async ({ page }) => {
  const ts = Date.now();
  const name = `E2E col ${ts}`;
  await page.goto("/collections");
  await page.getByPlaceholder("Название коллекции").fill(name);
  await page.getByRole("button", { name: "Создать" }).click();
  const card = page.locator("div.rounded-2xl", { hasText: name });
  await expect(card).toBeVisible({ timeout: 15000 });

  const slugText = (await card.getByText(/^\/[a-z0-9-]+$/).first().textContent())?.trim();
  expect(slugText, "slug показан").toBeTruthy();

  await card.getByRole("button", { name: "Изменить" }).click();
  const newName = `${name} v2`;
  await card.getByLabel("Название коллекции").fill(newName);
  await card.getByLabel("Описание коллекции").fill(`desc ${ts}`);
  // slug в форме редактирования — только текст, без поля ввода.
  expect(card.getByLabel("Slug коллекции")).toHaveCount(0);
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.locator("div.rounded-2xl", { hasText: newName })).toBeVisible({ timeout: 15000 });
  const slugAfter = (await page.locator("div.rounded-2xl", { hasText: newName }).getByText(/^\/[a-z0-9-]+$/).first().textContent())?.trim();
  expect(slugAfter, "slug не изменился").toBe(slugText);
});

test("задача: удаление своей задачи через tRPC", async ({ page }) => {
  const ts = Date.now();
  const title = `E2E task rm ${ts}`;
  const created = await trpc(page, "task.create", { title });
  expect(created.op.error).toBeUndefined();
  const id = (created.op.result?.data.json as { id: string }).id;

  const removed = await trpc(page, "task.remove", { id });
  expect(removed.op.error).toBeUndefined();

  const { op } = await trpc(page, "task.list", undefined, true);
  const tasks = (op.result?.data.json ?? []) as Array<{ id: string }>;
  expect(tasks.find((t) => t.id === id)).toBeUndefined();
});

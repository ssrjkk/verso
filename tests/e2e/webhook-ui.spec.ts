import { test, expect } from "@playwright/test";
import { createServer, type IncomingMessage, type Server } from "node:http";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

type Hit = { event: string; sign: string; body: string };

// Сквозная доставка вебхука: UI -> echo-сервер на 127.0.0.1 -> проверка подписи HMAC.
test("webhook e2e delivery with HMAC", async ({ page }) => {
  const ts = Date.now();
  const name = `E2E hook ${ts}`;
  const hits: Hit[] = [];
  const server: Server = createServer((req: IncomingMessage, res) => {
    let raw = "";
    req.on("data", (c: Buffer) => { raw += c.toString(); });
    req.on("end", () => {
      try {
        const parsed = JSON.parse(raw) as { event?: string };
        hits.push({
          event: String(req.headers["x-verso-event"] ?? parsed.event ?? ""),
          sign: String(req.headers["x-verso-sign"] ?? ""),
          body: raw,
        });
      } catch { /* ignore malformed */ }
      res.statusCode = 200;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  expect(port).toBeGreaterThan(0);

  try {
    await page.goto("/settings");
    await page.getByPlaceholder("Название", { exact: true }).fill(name);
    await page.getByPlaceholder("https://…").fill(`http://127.0.0.1:${port}/hook`);
    await page.getByPlaceholder("secret").fill(`s3cr3t-${ts}`);
    await page.getByRole("button", { name: "Добавить" }).click();
    const row = page.locator("div.rounded-xl", { hasText: name });
    await expect(row).toBeVisible({ timeout: 15000 });

    await row.getByRole("button", { name: "Выкл" }).click();
    await expect(row.getByText("выкл")).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Вкл" }).click();
    await expect(row.getByText("активен")).toBeVisible({ timeout: 10000 });

    await row.getByRole("button", { name: "Тест" }).click();
    await expect.poll(async () => hits.length, { timeout: 15000 }).toBeGreaterThan(0);
    expect(hits[0].event).toBe("ping");
    expect(hits[0].sign).toMatch(/^sha256=[0-9a-f]{64}$/);
    // Результат доставки виден в UI (lastStatus/lastDeliveryAt).
    await expect(row.getByText(/статус 200/)).toBeVisible({ timeout: 10000 });

    // Подпись проверяема независимо: sha256-hex от тела на секрете
    const { createHmac } = await import("node:crypto");
    const expected = `sha256=${createHmac("sha256", `s3cr3t-${ts}`).update(hits[0].body).digest("hex")}`;
    expect(hits[0].sign).toBe(expected);

    page.once("dialog", (d) => void d.accept());
    await row.getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText(name)).toBeHidden({ timeout: 10000 });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("webhook.create отклоняет user:pass@ и не-http(s) URL", async ({ page }) => {
  for (const url of ["http://user:pass@example.com/hook", "ftp://example.com/hook"]) {
    const res = await page.request.post("/api/trpc/webhook.create?batch=1", {
      headers: { "content-type": "application/json" },
      data: { "0": { json: { name: `bad-${Date.now()}`, url, secret: "s" } } },
    });
    const body = (await res.json()) as Array<{ error?: { json: { data: { code: string } } } }>;
    expect(body[0].error?.json.data.code).toBe("BAD_REQUEST");
  }
});

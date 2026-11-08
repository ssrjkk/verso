import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Cron-триггер без секрета и с чужим секретом: маршрут закрыт (401/503),
// публикация не происходит.
test("cron publish-due отклоняет неавторизованные вызовы", async ({ page }) => {
  const cases: Record<string, string>[] = [{}, { authorization: "Bearer wrong-secret" }];
  for (const headers of cases) {
    const res = await page.request.post("/api/cron/publish-due", { headers });
    expect([401, 503], `статус для ${JSON.stringify(headers)}`).toContain(res.status());
    const body = (await res.json()) as { error?: string; published?: unknown };
    expect(body.error, "тело объясняет отказ").toBeTruthy();
    expect(body.published, "ничего не опубликовано").toBeUndefined();
  }
});

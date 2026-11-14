import { test, expect } from "@playwright/test";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Cron-триггеры без секрета и с чужим секретом: маршруты закрыты (401/503),
// публикация и доставка не происходят.
test("cron-маршруты отклоняют неавторизованные вызовы", async ({ page }) => {
  const cases: Record<string, string>[] = [{}, { authorization: "Bearer wrong-secret" }];
  for (const route of ["publish-due", "webhooks"]) {
    for (const headers of cases) {
      const res = await page.request.post(`/api/cron/${route}`, { headers });
      expect(
        [401, 503],
        `статус ${route} для ${JSON.stringify(headers)}`,
      ).toContain(res.status());
      const body = (await res.json()) as { error?: string; published?: unknown };
      expect(body.error, "тело объясняет отказ").toBeTruthy();
      expect(body.published, "ничего не опубликовано").toBeUndefined();
    }
  }
});

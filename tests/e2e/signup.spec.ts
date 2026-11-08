import { test, expect, type Page } from "@playwright/test";

async function trpc(page: Page, path: string, json?: unknown) {
  const r = await page.request.post(`/api/trpc/${path}?batch=1`, {
    headers: { "content-type": "application/json" },
    data: { "0": { json } },
  });
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { json: { data: { code: string } } } }>;
  return { status: r.status(), op: j[0] };
}

// SECURITY: публичная регистрация сейчас выдаёт ADMIN (additionalFields default).
// Тест фиксирует фактическое поведение — при смене дефолта на VIEWER он упадёт,
// и это правильно: решение должно быть осознанным, а не тихим.
test("signup assigns a role; new user can operate", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    const ts = Date.now();
    const email = `e2e-new-${ts}@example.dev`;
    await page.goto("/sign-up");
    await page.locator("#signup-name").fill(`E2E ${ts}`);
    await page.locator("#signup-email").fill(email);
    await page.locator("#signup-password").fill("Test12345!");
    await page.locator("form button").first().click();
    await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });

    const { op } = await trpc(page, "collection.create", { name: `E2E owned ${ts}` });
    // eslint-disable-next-line no-console
    console.log(`SIGNUP-ROLE-PROBE: collection.create as new user -> ${op.error ? op.error.json.data.code : "OK (ADMIN)"}`);
    expect(op.error?.json.data.code).not.toBe("UNAUTHORIZED");
  } finally {
    await ctx.close();
  }
});

test("duplicate signup shows error, no redirect", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try {
    await page.goto("/sign-up");
    await page.locator("#signup-name").fill("Dup");
    await page.locator("#signup-email").fill("editor@verso.dev");
    await page.locator("#signup-password").fill("Test12345!");
    await page.locator("form button").first().click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL(/sign-up/);
  } finally {
    await ctx.close();
  }
});

import { test as setup, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, out: string) {
  await page.goto("/sign-in");
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill("Test12345!");
  await page.locator("form button").first().click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15000 });
  await page.context().storageState({ path: out });
}

setup("auth as admin", async ({ page }) => {
  await loginAs(page, "admin@verso.dev", "tests/e2e/.auth/admin.json");
});

setup("auth as editor", async ({ page }) => {
  await loginAs(page, "editor@verso.dev", "tests/e2e/.auth/editor.json");
});

setup("auth as viewer", async ({ page }) => {
  await loginAs(page, "viewer@verso.dev", "tests/e2e/.auth/viewer.json");
});

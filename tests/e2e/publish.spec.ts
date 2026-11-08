import { test, expect } from "@playwright/test";

test("landing renders brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Verso").first()).toBeVisible();
});

test("sign-in form is displayed", async ({ page }) => {
  await page.goto("/sign-in");
  const email = page.locator('input[type="email"], input[placeholder="email"]');
  await expect(email.first()).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator("form button").first()).toBeVisible();
});

test("unauthenticated dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/sign-in/, { timeout: 15000 });
});

import { test, expect } from "@playwright/test";

test("landing renders hero, modules and CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Verso — контент");
  await expect(page.getByRole("heading", { name: "Шесть модулей из коробки" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Открыть дашборд/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub/ })).toBeVisible();
});

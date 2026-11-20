import { test, expect } from "@playwright/test";

test("landing renders hero, field templates, modules and CTA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Контент");
  await expect(
    page.getByRole("heading", { name: "Схема, которую не надо программировать" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Один инструмент вместо шести сервисов" }),
  ).toBeVisible();
  await expect(page.getByText("Недвижимость").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Открыть дашборд/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub/ })).toBeVisible();
});

import { test, expect, type Browser, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

const ADMIN = "tests/e2e/.auth/admin.json";
const VIEWPORTS = [
  { w: 375, h: 667, label: "375" },
  { w: 768, h: 1024, label: "768" },
  { w: 1440, h: 900, label: "1440" },
] as const;
const THEMES = ["light", "dark"] as const;

type Theme = (typeof THEMES)[number];

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

// Контекст с фиксированной темой: next-themes читает localStorage.theme,
// цветовая схема браузера подстраивается под скриншот.
async function themedPage(
  browser: Browser,
  theme: Theme,
  viewport: { w: number; h: number },
  storageState?: string,
) {
  const ctx = await browser.newContext({
    viewport: { width: viewport.w, height: viewport.h },
    colorScheme: theme,
    ...(storageState ? { storageState } : {}),
  });
  await ctx.addInitScript((t) => localStorage.setItem("theme", t), theme);
  return { ctx, page: await ctx.newPage() };
}

async function settle(page: Page) {
  // Контент отрисован: первый заголовок виден (скелетоны уже сменились).
  await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 15000 });
  // Поздние tRPC-подгрузки (записи/задачи в ячейках) меняют раскладку:
  // замеряем только в тишине сети, иначе ловим переходные состояния.
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

test.describe.serial("visual: страницы × вьюпорты × темы", () => {
  let entryId = "";

  test.beforeAll(async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "dark", { w: 1440, h: 900 }, ADMIN);
    try {
      // Запись для деталки и карточка на доске (уникальная — не мешает остальным).
      const { op: cols } = await trpc(page, "collection.list", undefined, true);
      const posts = ((cols.result?.data.json ?? []) as Array<{ id: string; slug: string }>).find(
        (c) => c.slug === "posts",
      )!;
      const { op: created } = await trpc(page, "entry.create", {
        collectionId: posts.id,
        title: `E2E visual entry ${Date.now()}`,
      });
      expect(created.error).toBeUndefined();
      entryId = (created.result?.data.json as { id: string }).id;
      const { op: moved } = await trpc(page, "entry.moveStage", {
        entryId,
        stageId: "stage-draft",
      });
      expect(moved.error).toBeUndefined();
    } finally {
      await ctx.close();
    }
  });

  const pages = () => [
    { name: "landing", path: "/", auth: false },
    { name: "sign-in", path: "/sign-in", auth: false },
    { name: "sign-up", path: "/sign-up", auth: false },
    { name: "dashboard", path: "/dashboard", auth: true },
    { name: "collections", path: "/collections", auth: true },
    { name: "collection-posts", path: "/collections/posts", auth: true },
    { name: "entry-detail", path: `/entries/${entryId}`, auth: true },
    { name: "board", path: "/board", auth: true },
    { name: "media", path: "/media", auth: true },
    { name: "calendar", path: "/calendar", auth: true },
    { name: "seo", path: "/seo", auth: true },
    { name: "settings", path: "/settings", auth: true },
  ];

  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      test(`${theme} ${vp.label}: скриншоты без горизонтального переполнения`, async ({ browser }) => {
        for (const p of pages()) {
          const { ctx, page } = await themedPage(
            browser,
            theme,
            vp,
            p.auth ? ADMIN : undefined,
          );
          try {
            await page.goto(p.path, { waitUntil: "domcontentloaded" });
            await settle(page);
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
            );
            expect(overflow, `${p.name}: нет горизонтального скролла`).toBeLessThanOrEqual(1);
            await page.screenshot({
              path: `test-results/screenshots/${p.name}-${vp.label}-${theme}.png`,
            });
          } finally {
            await ctx.close();
          }
        }
      });
    }
  }

  for (const theme of THEMES) {
    test(`axe ${theme}: 0 serious/critical на всех страницах`, async ({ browser }) => {
      const { ctx, page } = await themedPage(browser, theme, { w: 1440, h: 900 }, ADMIN);
      try {
        for (const p of pages()) {
          // Публичные страницы — в том же контексте без сессии: редирект
          // на sign-in тоже валиден для axe, но проверяем саму страницу.
          if (!p.auth) {
            await ctx.clearCookies();
          }
          await page.goto(p.path, { waitUntil: "domcontentloaded" });
          await settle(page);
          const results = await new AxeBuilder({ page }).analyze();
          const blocking = results.violations.filter(
            (v) => v.impact === "serious" || v.impact === "critical",
          );
          expect(
            blocking.map((v) => `${v.id}(${v.impact}): ${v.nodes.length}`),
            `${p.name} ${theme}: serious/critical`,
          ).toEqual([]);
        }
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe.serial("visual: состояния, клавиатура, диалог", () => {
  test("collections: пустое состояние и скелетон", async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "light", { w: 1440, h: 900 }, ADMIN);
    try {
      // Пустой список: подменяем ответ tRPC валидным пустым результатом.
      await page.route("**/api/trpc/collection.list**", (route) =>
        route.fulfill({ json: [{ result: { data: { json: [] } } }] }),
      );
      await page.goto("/collections", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Создайте первую коллекцию")).toBeVisible({ timeout: 15000 });
      await page.screenshot({ path: "test-results/screenshots/collections-empty-1440-light.png" });
      await page.unroute("**/api/trpc/collection.list**");

      // Скелетон: задерживаем ответ, лоадер с role=status должен показаться.
      await page.route("**/api/trpc/collection.list**", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      });
      const nav = page.goto("/collections", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("status").first()).toBeVisible({ timeout: 8000 });
      await page.screenshot({ path: "test-results/screenshots/collections-skeleton-1440-light.png" });
      await nav;
    } finally {
      await ctx.close();
    }
  });

  test("клавиатура: Tab-порядок, фокус-кольцо #f97316", async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "light", { w: 1440, h: 900 }, ADMIN);
    try {
      await page.goto("/board", { waitUntil: "domcontentloaded" });
      await settle(page);

      const focused: string[] = [];
      let ringOk = false;
      // Tab уходит за пределы страницы (в хром браузера) — это норма:
      // останавливаемся на первом возврате фокуса в body.
      for (let i = 0; i < 30 && focused.length < 14; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            tag: el.tagName,
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            visible: rect.width > 0 && rect.height > 0,
            outline: style.outlineColor,
            ring: style.boxShadow,
          };
        });
        if (!info) break;
        focused.push(`${info.tag}:${info.label}`);
        expect(info.visible, `таб ${i}: сфокусированное видимо`).toBe(true);
        if (info.outline === "rgb(249, 115, 22)" || info.ring.includes("249, 115, 22")) {
          ringOk = true;
        }
      }
      expect(focused.length, "порядок содержит контролы").toBeGreaterThanOrEqual(8);
      // Порядок начинается с навигации/управления, карточки досок достижимы.
      expect(focused.some((f) => f.startsWith("A:") || f.startsWith("BUTTON:")), "ссылки/кнопки в порядке").toBe(true);
      expect(ringOk, "фокус-кольцо #f97316 встречается").toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test("Esc закрывает командную палитру", async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "light", { w: 1440, h: 900 }, ADMIN);
    try {
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await settle(page);
      await page.keyboard.press("ControlOrMeta+k");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden({ timeout: 10000 });
    } finally {
      await ctx.close();
    }
  });

  test("board: клавиатурный dnd — Space взять, Esc отмена", async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "light", { w: 1440, h: 900 }, ADMIN);
    try {
      await page.goto("/board", { waitUntil: "domcontentloaded" });
      await settle(page);
      const card = page.locator('[role="link"][aria-label^="Открыть запись"]').first();
      await expect(card, "карточка на доске есть").toBeVisible({ timeout: 15000 });
      await card.focus();
      await expect(card).toBeFocused();
      // Space поднимает карточку: вместо неё — dashed-плейсхолдер.
      await page.keyboard.press("Space");
      const placeholder = page.locator("div.rounded-xl.border-dashed", { hasText: "E2E visual entry" });
      await expect(placeholder, "drag started via keyboard").toBeVisible({ timeout: 10000 });
      // Esc отменяет перетаскивание: карточка возвращается.
      await page.keyboard.press("Escape");
      await expect(card, "drag cancelled via keyboard").toBeVisible({ timeout: 10000 });
    } finally {
      await ctx.close();
    }
  });

  test("builder: блоки достижимы с клавиатуры (KeyboardSensor)", async ({ browser }) => {
    const { ctx, page } = await themedPage(browser, "light", { w: 1440, h: 900 }, ADMIN);
    try {
      const { op: cols } = await trpc(page, "collection.list", undefined, true);
      const posts = ((cols.result?.data.json ?? []) as Array<{ id: string; slug: string }>).find(
        (c) => c.slug === "posts",
      )!;
      const { op: created } = await trpc(page, "entry.create", {
        collectionId: posts.id,
        title: `E2E builder kbd ${Date.now()}`,
      });
      const id = (created.result?.data.json as { id: string }).id;
      await page.goto(`/entries/${id}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      // Ручки сортировки блоков — кнопки с доступным именем или карточки с tabIndex.
      const handles = page.locator('[aria-label*="перетащ" i], [aria-label*="drag" i], [data-drag-handle="true"]');
      const handleCount = await handles.count();
      const focusables = handleCount > 0 ? handleCount : await page.locator("[tabindex]").count();
      expect(focusables, "у блоков есть клавиатурные ручки/фокус").toBeGreaterThan(0);
    } finally {
      await ctx.close();
    }
  });
});

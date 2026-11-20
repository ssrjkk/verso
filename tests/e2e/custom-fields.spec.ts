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
  const j = (await r.json()) as Array<{ result?: { data: { json: unknown } }; error?: { message: string } }>;
  return { status: r.status(), op: j[0] };
}

type EntryRow = {
  id: string;
  title: string;
  slug: string;
  fieldsJson: string;
};

// Полный путь конфигурируемых полей: отраслевой шаблон -> коллекция ->
// динамическая форма -> сохранение -> таблица -> публичная страница.
test("custom fields: template, dynamic form, edit and public page", async ({ page }) => {
  const ts = Date.now();
  const collectionName = `Мероприятия E2E ${ts}`;
  const title = `Конференция ${ts}`;
  const start = "2026-12-31";
  const venue = "Москва, Технопарк";
  const editedVenue = "Санкт-Петербург, Севкабель Порт";
  let collectionId = "";
  let entryId = "";

  try {
    await page.goto("/collections");
    await page.getByPlaceholder("Название коллекции").fill(collectionName);

    // Шаблон применяется в конструкторе, а не хардкодится в форме.
    await page.locator("summary", { hasText: "Поля коллекции" }).first().click();
    await page.locator("#create-schema-template").selectOption("events");
    await page.getByRole("button", { name: "Применить", exact: true }).click();
    await expect(page.locator("#create-schema-field-0-label")).toHaveValue("Начало");
    await expect(page.locator("#create-schema-field-1-label")).toHaveValue("Окончание");

    await page.getByRole("button", { name: "Создать", exact: true }).click();
    const card = page.getByTestId("collection-card").filter({ hasText: collectionName }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText("Поля:");
    await card.getByRole("link", { name: "Открыть", exact: true }).click();

    const cols = await trpc(page, "collection.list", undefined, true);
    const collection = ((cols.op.result?.data.json ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
    }>).find((item) => item.name === collectionName);
    expect(collection, "collection created via UI").toBeTruthy();
    collectionId = collection!.id;

    await expect(page.getByRole("columnheader", { name: "Начало" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Формат" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Платное участие" })).toBeVisible();

    await page.getByRole("button", { name: "Создать запись" }).click();
    await page.locator("#entry-title").fill(title);

    // Обязательное поле проверяется на клиенте и не уходит на сервер.
    await page.getByRole("button", { name: "Создать", exact: true }).click();
    await expect(page.locator("#entry-field-starts_at-error")).toContainText("Начало");
    await expect(page.locator("#entry-title")).toBeVisible();

    await page.locator("#entry-field-starts_at").fill(start);
    await page.locator("#entry-field-format").selectOption("Офлайн");
    await page.locator("#entry-field-venue").fill(venue);
    await page.locator("#entry-field-seats").fill("120");
    await page.locator("#entry-field-paid").check();
    await page.getByRole("button", { name: "Создать", exact: true }).click();

    const row = page.locator("tbody tr", { hasText: title });
    await expect(row).toBeVisible({ timeout: 15000 });
    await expect(row).toContainText("Офлайн");
    await expect(row).toContainText("120");
    await expect(row).toContainText("Да");

    const listed = await trpc(page, "entry.list", { collectionId }, true);
    const entries = (listed.op.result?.data.json ?? []) as EntryRow[];
    const created = entries.find((entry) => entry.title === title);
    expect(created, "entry created with custom fields").toBeTruthy();
    entryId = created!.id;
    expect(JSON.parse(created!.fieldsJson)).toMatchObject({
      starts_at: start,
      format: "Офлайн",
      venue,
      seats: 120,
      paid: true,
    });

    // Экспорт содержит колонки схемы, поэтому данные можно выгрузить и
    // переимпортировать без потери полей.
    const csvExport = await trpc(page, "collection.exportCsv", { collectionId }, true);
    const csv = csvExport.op.result?.data.json as string;
    expect(csv.split("\r\n")[0]).toContain("starts_at,ends_at,venue,format,seats,registration_url,paid");
    expect(csv).toContain(title);
    expect(csv).toContain(venue);

    // Редактирование: значения подставляются в динамическую форму и
    // сохраняются обратно без потери типов.
    await row.getByRole("button", { name: "Ред.", exact: true }).click();
    await expect(page.locator("#entry-field-venue")).toHaveValue(venue);
    await expect(page.locator("#entry-field-seats")).toHaveValue("120");
    await expect(page.locator("#entry-field-paid")).toBeChecked();
    await page.locator("#entry-field-venue").fill(editedVenue);
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.locator("tbody tr", { hasText: editedVenue })).toBeVisible({ timeout: 15000 });

    const after = await trpc(page, "entry.list", { collectionId }, true);
    const updated = ((after.op.result?.data.json ?? []) as EntryRow[]).find(
      (entry) => entry.id === entryId,
    );
    expect(JSON.parse(updated!.fieldsJson)).toMatchObject({
      starts_at: start,
      format: "Офлайн",
      venue: editedVenue,
      seats: 120,
      paid: true,
    });

    // Публичная страница показывает поля коллекции, а не только блоки.
    await trpc(page, "entry.publish", { id: entryId });
    await page.goto(`/p/${collection!.slug}/${updated!.slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Детали" })).toBeVisible();
    await expect(page.getByText("Санкт-Петербург, Севкабель Порт")).toBeVisible();
    await expect(page.getByText("31 декабря 2026")).toBeVisible();
  } finally {
    if (entryId) await trpc(page, "entry.remove", { id: entryId });
    if (collectionId) await trpc(page, "collection.remove", { id: collectionId });
  }
});

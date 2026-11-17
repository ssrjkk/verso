import { describe, expect, it } from "vitest";
import {
  checkCollectionSchema,
  parseCollectionSchema,
  parseFieldValues,
  serializeCollectionSchema,
  validateEntryFieldValues,
  type CollectionField,
} from "@/lib/collection-schema";
import { z } from "zod";

const PRICE: CollectionField = {
  key: "price",
  label: "Цена",
  type: "number",
  required: true,
};
const CATEGORY: CollectionField = {
  key: "category",
  label: "Категория",
  type: "select",
  required: false,
  options: ["услуга", "товар"],
};
const CONSENT: CollectionField = {
  key: "consent",
  label: "Согласие",
  type: "checkbox",
  required: true,
};

describe("collection schema", () => {
  it("roundtrip: сериализует и разбирает поля с дефолтами", () => {
    const json = serializeCollectionSchema([PRICE, CATEGORY]);
    expect(parseCollectionSchema(json)).toEqual([
      { ...PRICE, required: true },
      { ...CATEGORY, required: false },
    ]);
  });

  it("битый JSON и не-массив не роняют чтение", () => {
    expect(parseCollectionSchema("not json")).toEqual([]);
    expect(parseCollectionSchema('{"key":"x"}')).toEqual([]);
    expect(parseCollectionSchema(null)).toEqual([]);
  });

  it("строгая проверка сообщает путь и причину", () => {
    const result = checkCollectionSchema(
      JSON.stringify([{ key: "Price", label: "", type: "text" }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Поле");
      expect(result.message).toContain("Ключ");
    }
  });

  it("запрещает дубли ключей", () => {
    const result = checkCollectionSchema(
      JSON.stringify([PRICE, { ...PRICE, label: "Вторая цена" }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("уже используется");
  });

  it("список требует варианты без повторов", () => {
    const noOptions = checkCollectionSchema(
      JSON.stringify([{ key: "kind", label: "Вид", type: "select" }]),
    );
    expect(noOptions.ok).toBe(false);

    const duplicates = checkCollectionSchema(
      JSON.stringify([
        { key: "kind", label: "Вид", type: "select", options: ["a", "a"] },
      ]),
    );
    expect(duplicates.ok).toBe(false);
  });

  it("варианты запрещены не-select типам", () => {
    const result = checkCollectionSchema(
      JSON.stringify([
        { key: "name", label: "Имя", type: "text", options: ["a"] },
      ]),
    );
    expect(result.ok).toBe(false);
  });

  it("системные ключи записи зарезервированы", () => {
    const result = checkCollectionSchema(
      JSON.stringify([{ key: "title", label: "Заголовок", type: "text" }]),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("зарезервирован");
  });

  it("zod-схема валидирует вход tRPC", () => {
    const result = z
      .array(
        z.object({
          key: z.string().regex(/^[a-z][a-z0-9_]*$/),
        }),
      )
      .safeParse([{ key: "price" }, { key: "bad-key" }]);
    expect(result.success).toBe(false);
  });
});

describe("entry field values", () => {
  const schema = [PRICE, CATEGORY, CONSENT];

  it("нормализует число, список и флажок", () => {
    const result = validateEntryFieldValues(
      schema,
      JSON.stringify({ price: "1250.50", category: "товар", consent: true }),
    );
    expect(result).toEqual({
      ok: true,
      json: JSON.stringify({ price: 1250.5, category: "товар", consent: true }),
    });
  });

  it("требует обязательные поля и подтверждение флажка", () => {
    const result = validateEntryFieldValues(
      schema,
      JSON.stringify({ category: "товар", consent: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.price).toContain("Заполните");
      expect(result.errors.consent).toContain("Подтвердите");
    }
  });

  it("удаляет пустые необязательные поля и сохраняет неизвестные ключи", () => {
    const result = validateEntryFieldValues(
      schema,
      JSON.stringify({
        price: 10,
        category: "",
        consent: true,
        legacy_note: "не терять",
      }),
    );
    expect(result).toEqual({
      ok: true,
      json: JSON.stringify({ price: 10, consent: true, legacy_note: "не терять" }),
    });
  });

  it("проверяет дату, URL и email", () => {
    const fields: CollectionField[] = [
      { key: "starts", label: "Старт", type: "date", required: false },
      { key: "link", label: "Ссылка", type: "url", required: false },
      { key: "mail", label: "Почта", type: "email", required: false },
    ];
    const bad = validateEntryFieldValues(
      fields,
      JSON.stringify({ starts: "2026-13-40", link: "ftp://x", mail: "no" }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.errors)).toEqual(["starts", "link", "mail"]);
    }

    const good = validateEntryFieldValues(
      fields,
      JSON.stringify({
        starts: "2026-02-28",
        link: "https://example.com/a",
        mail: "hi@example.com",
      }),
    );
    expect(good.ok).toBe(true);

    const feb31 = validateEntryFieldValues(
      [{ key: "starts", label: "Старт", type: "date", required: false }],
      JSON.stringify({ starts: "2026-02-31" }),
    );
    expect(feb31.ok).toBe(false);
  });

  it("нечисловая цена и чужая опция списка отклоняются", () => {
    const result = validateEntryFieldValues(
      schema,
      JSON.stringify({ price: "дорого", category: "другое", consent: true }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.price).toContain("число");
      expect(result.errors.category).toContain("из списка");
    }
  });

  it("невалидный JSON и массив дают общую ошибку формы", () => {
    for (const raw of ["{", "[]", "null"]) {
      const result = validateEntryFieldValues(schema, raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors._form).toBeTruthy();
    }
  });

  it("пустая схема принимает любой объект (легаси-режим)", () => {
    const result = validateEntryFieldValues([], '{"any":"value"}');
    expect(result).toEqual({ ok: true, json: '{"any":"value"}' });
  });

  it("parseFieldValues не падает на мусоре", () => {
    expect(parseFieldValues('{"a":1}')).toEqual({ a: 1 });
    expect(parseFieldValues("[]")).toEqual({});
    expect(parseFieldValues("{")).toEqual({});
    expect(parseFieldValues(undefined)).toEqual({});
  });
});

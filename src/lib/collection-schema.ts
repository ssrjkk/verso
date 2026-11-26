import { z } from "zod";

/**
 * Схема полей коллекции.
 *
 * `Collection.schemaJson` хранит массив описаний, а `Entry.fieldsJson` —
 * значения по ключам. Схема не меняет таблицы SQLite: любая отрасль получает
 * свои поля без миграций, а старые записи остаются читаемыми. Пустая схема
 * (`[]`) — легаси-режим: значения не валидируются, форма показывает JSON.
 */
export const COLLECTION_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
  "url",
  "email",
] as const;

export type CollectionFieldType = (typeof COLLECTION_FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<CollectionFieldType, string> = {
  text: "Текст",
  textarea: "Многострочный текст",
  number: "Число",
  date: "Дата",
  select: "Список",
  checkbox: "Флажок",
  url: "Ссылка",
  email: "Email",
};

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// Системные поля записи нельзя дублировать в fieldsJson: это путает
// Headless-клиентов, CSV-колонки и восстановление из ревизий.
const RESERVED_FIELD_KEYS = new Set([
  "title",
  "slug",
  "status",
  "excerpt",
  "author",
  "stage",
  "tags",
  "seo_title",
  "seo_description",
  "canonical_url",
  "og_image_url",
  "no_index",
  "scheduled_for",
  "published_at",
  "created_at",
  "updated_at",
]);

export const collectionFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Ключ поля обязателен")
      .max(40)
      .regex(
        FIELD_KEY_RE,
        "Ключ: латиница, цифры и _, начиная с буквы (например, price_from)",
      ),
    label: z.string().trim().min(1, "Название поля обязательно").max(120),
    type: z.enum(COLLECTION_FIELD_TYPES),
    required: z.boolean().optional().default(false),
    placeholder: z.string().trim().max(200).optional(),
    help: z.string().trim().max(300).optional(),
    options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  })
  .superRefine((field, ctx) => {
    if (RESERVED_FIELD_KEYS.has(field.key)) {
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: `Ключ «${field.key}» зарезервирован системным полем записи`,
      });
    }
    if (field.type === "select") {
      const options = field.options ?? [];
      if (options.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Для списка добавьте хотя бы один вариант",
        });
      } else if (new Set(options).size !== options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["options"],
          message: "Варианты списка не должны повторяться",
        });
      }
    } else if (field.options?.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Варианты доступны только для типа «Список»",
      });
    }
  });

export const collectionSchemaSchema = z
  .array(collectionFieldSchema)
  .max(50, "В коллекции не больше 50 настраиваемых полей")
  .superRefine((fields, ctx) => {
    const seen = new Map<string, number>();
    fields.forEach((field, index) => {
      const previous = seen.get(field.key);
      if (previous === undefined) {
        seen.set(field.key, index);
      } else {
        ctx.addIssue({
          code: "custom",
          path: [index, "key"],
          message: `Ключ «${field.key}» уже используется полем №${previous + 1}`,
        });
      }
    });
  });

export type CollectionField = z.infer<typeof collectionFieldSchema>;

/** Толерантный разбор для чтения БД: битая/старая схема не роняет страницу. */
export function parseCollectionSchema(
  raw: string | null | undefined,
): CollectionField[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = collectionSchemaSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

export function serializeCollectionSchema(fields: CollectionField[]): string {
  return JSON.stringify(collectionSchemaSchema.parse(fields));
}

/** Человекочитаемая ошибка полей для ответа tRPC/REST. */
export function formatFieldErrors(errors: Record<string, string>): string {
  const messages = Object.values(errors);
  return messages.length > 0 ? messages.join("; ") : "Некорректные значения полей";
}

export type SchemaCheck =
  | { ok: true; fields: CollectionField[]; json: string }
  | { ok: false; message: string };

/** Строгая проверка входного `schemaJson` (tRPC/API): ошибка вместо тихого []. */
export function checkCollectionSchema(raw: string): SchemaCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "schemaJson должен быть валидным JSON" };
  }
  const result = collectionSchemaSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path
      .map((part) => (typeof part === "number" ? `№${part + 1}` : part))
      .join(".");
    return {
      ok: false,
      message: path
        ? `Поле ${path}: ${issue?.message ?? "некорректное значение"}`
        : (issue?.message ?? "Некорректная схема полей"),
    };
  }
  return { ok: true, fields: result.data, json: JSON.stringify(result.data) };
}

/** Значения для начального состояния формы; не-объект считается пустым. */
export function parseFieldValues(
  raw: string | null | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export type FieldValuesCheck =
  | { ok: true; json: string }
  | { ok: false; errors: Record<string, string> };

type FieldError = { key: string; message: string };

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

function validateOne(
  field: CollectionField,
  value: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const label = `Поле «${field.label}»`;
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof value === "string"
        ? { ok: true, value }
        : { ok: false, error: `${label}: ожидается текст` };
    case "number": {
      const number =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim() !== ""
            ? Number(value)
            : Number.NaN;
      return Number.isFinite(number)
        ? { ok: true, value: number }
        : { ok: false, error: `${label}: укажите число` };
    }
    case "date": {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { ok: false, error: `${label}: дата в формате ГГГГ-ММ-ДД` };
      }
      const [year, month, day] = value.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (
        Number.isNaN(date.getTime()) ||
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
      ) {
        return { ok: false, error: `${label}: некорректная дата` };
      }
      return { ok: true, value };
    }
    case "select": {
      const options = field.options ?? [];
      return typeof value === "string" && options.includes(value)
        ? { ok: true, value }
        : { ok: false, error: `${label}: выберите вариант из списка` };
    }
    case "checkbox":
      return typeof value === "boolean"
        ? { ok: true, value }
        : { ok: false, error: `${label}: ожидается true или false` };
    case "url": {
      if (typeof value !== "string") {
        return { ok: false, error: `${label}: укажите ссылку` };
      }
      try {
        const url = new URL(value);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { ok: false, error: `${label}: только http(s)-ссылки` };
        }
        return { ok: true, value };
      } catch {
        return { ok: false, error: `${label}: некорректная ссылка` };
      }
    }
    case "email":
      return typeof value === "string" && isValidEmail(value)
        ? { ok: true, value }
        : { ok: false, error: `${label}: некорректный email` };
  }
}

/**
 * Валидирует и нормализует `fieldsJson` по схеме коллекции.
 *
 * - обязательные поля не могут быть пустыми (флажок — только `true`);
 * - число принимается как number или числовая строка и сохраняется числом;
 * - пустые необязательные значения удаляются;
 * - неизвестные ключи сохраняются: схема может эволюционировать, и правка
 *   формы не должна стирать данные, которых в текущей схеме ещё нет.
 */
export function validateEntryFieldValues(
  schema: CollectionField[],
  raw: string,
): FieldValuesCheck {
  let parsed: unknown;
  const source = raw.trim() === "" ? "{}" : raw;
  try {
    parsed = JSON.parse(source);
  } catch {
    return {
      ok: false,
      errors: { _form: "fieldsJson должен быть валидным JSON" },
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      errors: { _form: "fieldsJson должен быть JSON-объектом" },
    };
  }

  const input = parsed as Record<string, unknown>;
  const output: Record<string, unknown> = { ...input };
  const errors: FieldError[] = [];

  for (const field of schema) {
    const value = input[field.key];
    if (isEmpty(value)) {
      if (field.required) {
        errors.push({ key: field.key, message: `Заполните поле «${field.label}»` });
      } else {
        delete output[field.key];
      }
      continue;
    }
    if (field.type === "checkbox" && field.required && value !== true) {
      errors.push({
        key: field.key,
        message: `Подтвердите поле «${field.label}»`,
      });
      continue;
    }
    const checked = validateOne(field, value);
    if (!checked.ok) {
      errors.push({ key: field.key, message: checked.error });
    } else {
      output[field.key] = checked.value;
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: Object.fromEntries(errors.map((e) => [e.key, e.message])),
    };
  }
  return { ok: true, json: JSON.stringify(output) };
}

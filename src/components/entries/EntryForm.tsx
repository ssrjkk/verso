"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { slugify } from "@/lib/slug";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/datetime";
import {
  parseCollectionSchema,
  parseFieldValues,
  validateEntryFieldValues,
  type CollectionField,
} from "@/lib/collection-schema";

const formSchema = z.object({
  title: z.string().min(1, "Заголовок обязателен"),
  slug: z.string().optional(),
  collectionId: z.string().min(1, "Выберите коллекцию"),
  excerpt: z.string().optional(),
  fieldsJson: z.string().refine(
    (v) => {
      try {
        JSON.parse(v.trim() === "" ? "{}" : v);
        return true;
      } catch {
        return false;
      }
    },
    { message: "fieldsJson должен быть валидным JSON" },
  ),
  tags: z.string().optional(),
  scheduledFor: z
    .string()
    .optional()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), {
      message: "Некорректная дата",
    }),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
});

export type EntryFormInitial = {
  id: string;
  title: string;
  slug: string;
  collectionId: string;
  excerpt?: string | null;
  fieldsJson?: string | null;
  tags?: string[];
  scheduledFor?: string | Date | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

const inputCls =
  "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]";
const labelCls = "text-xs font-semibold uppercase tracking-wide opacity-60";
const errCls = "text-xs text-red-600 dark:text-red-500";

function fieldInputType(field: CollectionField): string {
  if (field.type === "number") return "number";
  if (field.type === "date") return "date";
  if (field.type === "url") return "url";
  if (field.type === "email") return "email";
  return "text";
}

function DynamicField({
  field,
  value,
  error,
  onChange,
}: {
  field: CollectionField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const id = `entry-field-${field.key}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [field.help ? helpId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  const help = field.help ? (
    <p id={helpId} className="mt-1 text-xs opacity-60">
      {field.help}
    </p>
  ) : null;
  const errorNode = error ? (
    <p id={errorId} role="alert" className={errCls}>
      {error}
    </p>
  ) : null;
  const textValue = value === undefined || value === null ? "" : String(value);

  if (field.type === "checkbox") {
    return (
      <div>
        <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
          <input
            id={id}
            type="checkbox"
            checked={value === true}
            aria-required={field.required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
          {field.required ? " *" : ""}
        </label>
        {help}
        {errorNode}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        <label htmlFor={id} className={labelCls}>
          {field.label}
          {field.required ? " *" : ""}
        </label>
        <textarea
          id={id}
          value={textValue}
          rows={3}
          placeholder={field.placeholder}
          aria-required={field.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        />
        {help}
        {errorNode}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <label htmlFor={id} className={labelCls}>
          {field.label}
          {field.required ? " *" : ""}
        </label>
        <select
          id={id}
          value={textValue}
          aria-required={field.required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={inputCls}
        >
          <option value="">— выберите —</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {help}
        {errorNode}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className={labelCls}>
        {field.label}
        {field.required ? " *" : ""}
      </label>
      <input
        id={id}
        type={fieldInputType(field)}
        value={textValue}
        step={field.type === "number" ? "any" : undefined}
        placeholder={field.placeholder}
        aria-required={field.required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {help}
      {errorNode}
    </div>
  );
}

export function EntryForm({
  collectionId: defaultCollectionId,
  schema,
  initial,
  onSaved,
  onCancel,
}: {
  collectionId?: string;
  /** Схема текущей коллекции; без неё берётся из collection.list. */
  schema?: CollectionField[];
  initial?: EntryFormInitial;
  onSaved?: (id: string) => void;
  onCancel?: () => void;
}) {
  const isEdit = Boolean(initial?.id);
  const { data: collections } = trpc.collection.list.useQuery();
  const createEntry = trpc.entry.create.useMutation();
  const updateEntry = trpc.entry.update.useMutation();
  const setTags = trpc.entry.setTags.useMutation();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [collectionId, setCollectionId] = useState(initial?.collectionId ?? defaultCollectionId ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [fieldsJson, setFieldsJson] = useState(initial?.fieldsJson ?? "{}");
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    parseFieldValues(initial?.fieldsJson),
  );
  const [tags, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [scheduledFor, setScheduledFor] = useState(toDateTimeLocalValue(initial?.scheduledFor));
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Схема приходит из страницы коллекции, но форма остаётся самодостаточной:
  // на общих страницах она находит поля по выбранной коллекции.
  const activeSchema = useMemo(() => {
    if (schema) return schema;
    const selected = (collections ?? []).find((item) => item.id === collectionId);
    return parseCollectionSchema(selected?.schemaJson);
  }, [schema, collections, collectionId]);

  const customMode = activeSchema.length > 0;
  const autoSlug = useMemo(() => slugify(title), [title]);
  const saving = createEntry.isPending || updateEntry.isPending || setTags.isPending;

  const setValue = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    setServerError(null);
    // В режиме полей отправляем значения как JSON; проверка ниже даёт
    // ошибки по каждому полю вместо одного невнятного сообщения сервера.
    const fieldsPayload = customMode
      ? JSON.stringify(values)
      : fieldsJson.trim() === ""
        ? "{}"
        : fieldsJson;
    const parsed = formSchema.safeParse({
      title,
      slug,
      collectionId,
      excerpt,
      fieldsJson: fieldsPayload,
      tags,
      scheduledFor,
      seoTitle,
      seoDescription,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    let normalizedFieldsJson = fieldsPayload;
    if (customMode) {
      const checked = validateEntryFieldValues(activeSchema, fieldsPayload);
      if (!checked.ok) {
        const fieldErrors: Record<string, string> = {};
        for (const [key, message] of Object.entries(checked.errors)) {
          fieldErrors[`field:${key}`] = message;
        }
        setErrors(fieldErrors);
        return;
      }
      normalizedFieldsJson = checked.json;
    }
    setErrors({});

    const finalSlug = slug.trim() !== "" ? slugify(slug) : undefined;
    const scheduledIso = dateTimeLocalToIso(scheduledFor);
    const extras: { seoTitle?: string; seoDescription?: string; scheduledFor?: string | null } = {
      ...(seoTitle.trim() !== "" ? { seoTitle: seoTitle.trim() } : {}),
      ...(seoDescription.trim() !== "" ? { seoDescription: seoDescription.trim() } : {}),
    };
    // При редактировании поле отправляется всегда: null явно снимает
    // расписание. При создании null не нужен — update вызывается только
    // если есть что сохранять.
    if (isEdit) extras.scheduledFor = scheduledIso;
    else if (scheduledIso) extras.scheduledFor = scheduledIso;
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      let id = initial?.id;
      if (isEdit && id) {
        await updateEntry.mutateAsync({
          id,
          title,
          ...(finalSlug ? { slug: finalSlug } : {}),
          excerpt: excerpt || undefined,
          fieldsJson: normalizedFieldsJson,
          ...extras,
        });
      } else {
        const created = await createEntry.mutateAsync({
          collectionId,
          title,
          ...(finalSlug ? { slug: finalSlug } : {}),
          ...(excerpt.trim() !== "" ? { excerpt: excerpt.trim() } : {}),
          fieldsJson: normalizedFieldsJson,
        });
        id = created.id;
        if (id && Object.keys(extras).length > 0) {
          await updateEntry.mutateAsync({ id, ...extras });
        }
      }
      if (id) {
        await setTags.mutateAsync({ entryId: id, tags: tagList });
        onSaved?.(id);
      }
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Не удалось сохранить запись");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="entry-title" className={labelCls}>Заголовок *</label>
        <input id="entry-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название записи" className={inputCls} />
        <p className="mt-1 text-xs opacity-60" aria-live="polite">
          Авто-slug из заголовка: <span className="font-mono">/{autoSlug || "—"}</span>
          {slug.trim() !== "" && (
            <> · будет использован: <span className="font-mono">/{slugify(slug)}</span></>
          )}
        </p>
        {errors.title && <p role="alert" className={errCls}>{errors.title}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="entry-slug" className={labelCls}>Slug (необязательно)</label>
          <input
            id="entry-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={autoSlug || "auto"}
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label htmlFor="entry-collection" className={labelCls}>Коллекция *</label>
          <select id="entry-collection" value={collectionId} onChange={(e) => {
            setCollectionId(e.target.value);
            // Значения полей принадлежат выбранной коллекции: при смене
            // коллекции в режиме создания не переносим чужие ключи.
            if (!isEdit) {
              setValues({});
              setFieldsJson("{}");
              setErrors({});
            }
          }} className={inputCls} disabled={isEdit}>
            <option value="">— выберите —</option>
            {(collections ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.collectionId && <p role="alert" className={errCls}>{errors.collectionId}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="entry-excerpt" className={labelCls}>Excerpt</label>
        <textarea id="entry-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} className={inputCls} />
      </div>

      {customMode ? (
        <fieldset className="flex flex-col gap-3 rounded-xl border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide opacity-60">
            Поля коллекции «{collections?.find((c) => c.id === collectionId)?.name ?? "—"}»
          </legend>
          {activeSchema.map((field) => (
            <DynamicField
              key={field.key}
              field={field}
              value={values[field.key]}
              error={errors[`field:${field.key}`]}
              onChange={(value) => setValue(field.key, value)}
            />
          ))}
        </fieldset>
      ) : (
        <div>
          <label htmlFor="entry-fields" className={labelCls}>fieldsJson (JSON)</label>
          <textarea
            id="entry-fields"
            value={fieldsJson}
            onChange={(e) => setFieldsJson(e.target.value)}
            rows={4}
            spellCheck={false}
            aria-describedby="entry-fields-hint"
            className={`${inputCls} font-mono text-xs`}
          />
          <p id="entry-fields-hint" className="mt-1 text-xs opacity-60">Валидный JSON-объект, например {}. Чтобы заменить JSON удобной формой, добавьте поля в настройках коллекции.</p>
          {errors.fieldsJson && <p role="alert" className={errCls}>{errors.fieldsJson}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="entry-tags" className={labelCls}>Теги (через запятую)</label>
          <input id="entry-tags" value={tags} onChange={(e) => setTagsInput(e.target.value)} placeholder="кейс, 2026" className={inputCls} />
        </div>
        <div>
          <label htmlFor="entry-scheduled" className={labelCls}>Публикация по расписанию</label>
          <input
            id="entry-scheduled"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="entry-seo-title" className={labelCls}>SEO title</label>
          <input id="entry-seo-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="entry-seo-desc" className={labelCls}>SEO description</label>
          <input id="entry-seo-desc" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} className={inputCls} />
        </div>
      </div>

      {serverError && <p role="alert" className="text-sm text-red-600 dark:text-red-500">{serverError}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          aria-busy={saving}
          className="rounded-xl bg-[#c2410c] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#9a3412] disabled:opacity-50"
        >
          {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
        </button>
        {onCancel && (
          <button onClick={onCancel} disabled={saving} className="rounded-xl border px-5 py-2.5 text-sm disabled:opacity-50">
            Отмена
          </button>
        )}
      </div>
    </div>
  );
}

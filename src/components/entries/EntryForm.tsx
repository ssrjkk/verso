"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { trpc } from "@/trpc/client";
import { slugify } from "@/lib/slug";
import { dateTimeLocalToIso, toDateTimeLocalValue } from "@/lib/datetime";

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

export function EntryForm({
  collectionId: defaultCollectionId,
  initial,
  onSaved,
  onCancel,
}: {
  collectionId?: string;
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
  const [tags, setTagsInput] = useState((initial?.tags ?? []).join(", "));
  const [scheduledFor, setScheduledFor] = useState(toDateTimeLocalValue(initial?.scheduledFor));
  const [seoTitle, setSeoTitle] = useState(initial?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(initial?.seoDescription ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const autoSlug = useMemo(() => slugify(title), [title]);
  const saving = createEntry.isPending || updateEntry.isPending || setTags.isPending;

  const inputCls =
    "w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]";
  const labelCls = "text-xs font-semibold uppercase tracking-wide opacity-60";
  const errCls = "text-xs text-red-600 dark:text-red-500";

  const handleSave = async () => {
    setServerError(null);
    const parsed = formSchema.safeParse({
      title,
      slug,
      collectionId,
      excerpt,
      fieldsJson,
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
          fieldsJson,
          ...extras,
        });
      } else {
        const created = await createEntry.mutateAsync({
          collectionId,
          title,
          ...(finalSlug ? { slug: finalSlug } : {}),
          ...(excerpt.trim() !== "" ? { excerpt: excerpt.trim() } : {}),
          fieldsJson: fieldsJson.trim() === "" ? "{}" : fieldsJson,
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
          <select id="entry-collection" value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className={inputCls} disabled={isEdit}>
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
        <p id="entry-fields-hint" className="mt-1 text-xs opacity-60">Валидный JSON-объект, например {}.</p>
        {errors.fieldsJson && <p role="alert" className={errCls}>{errors.fieldsJson}</p>}
      </div>

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

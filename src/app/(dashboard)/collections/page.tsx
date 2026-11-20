"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { useSession } from "@/lib/auth-client";
import { slugify } from "@/lib/slug";
import { ExportButton, ImportButton } from "@/components/collections/CsvButtons";
import { SchemaEditor } from "@/components/collections/SchemaEditor";
import {
  checkCollectionSchema,
  parseCollectionSchema,
  type CollectionField,
} from "@/lib/collection-schema";

const ICONS = ["FileText", "Newspaper", "Folder", "LayoutGrid", "BookOpen", "ShoppingBag"];

export default function CollectionsPage() {
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const { data, isLoading } = trpc.collection.list.useQuery();
  const create = trpc.collection.create.useMutation({
    onSuccess: () => {
      utils.collection.list.invalidate();
      setName("");
      setSlug("");
      setDesc("");
      setCreateFields([]);
    },
  });
  const remove = trpc.collection.remove.useMutation({
    onSuccess: () => utils.collection.list.invalidate(),
  });
  const update = trpc.collection.update.useMutation({
    onSuccess: () => {
      utils.collection.list.invalidate();
      setEditingId(null);
    },
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [icon, setIcon] = useState("FileText");
  const [createFields, setCreateFields] = useState<CollectionField[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Inline-редактирование карточки: name + description. Slug — только текст:
  // это часть URL Headless API, его смена ломает интеграции.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editFields, setEditFields] = useState<CollectionField[]>([]);
  const [editError, setEditError] = useState<string | null>(null);

  const preview = useMemo(() => slugify(slug.trim() !== "" ? slug : name), [slug, name]);

  const handleCreate = () => {
    setError(null);
    if (!name.trim()) {
      setError("Название обязательно");
      return;
    }
    const schemaCheck = checkCollectionSchema(JSON.stringify(createFields));
    if (!schemaCheck.ok) {
      setError(schemaCheck.message);
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        ...(slug.trim() !== "" ? { slug: slugify(slug) } : {}),
        ...(desc.trim() !== "" ? { description: desc.trim() } : {}),
        icon,
        fields: createFields,
      },
      { onError: (e) => setError(e.message) },
    );
  };

  const handleDelete = (id: string, collectionName: string) => {
    if (!window.confirm(`Удалить коллекцию «${collectionName}» вместе со всеми записями?`)) return;
    remove.mutate({ id });
  };

  const startEdit = (c: {
    id: string;
    name: string;
    description: string | null;
    schemaJson: string;
  }) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
    setEditFields(parseCollectionSchema(c.schemaJson));
    setEditError(null);
  };

  const handleSaveEdit = (id: string) => {
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Название обязательно");
      return;
    }
    const schemaCheck = checkCollectionSchema(JSON.stringify(editFields));
    if (!schemaCheck.ok) {
      setEditError(schemaCheck.message);
      return;
    }
    update.mutate(
      { id, name: editName.trim(), description: editDesc.trim(), fields: editFields },
      { onError: (e) => setEditError(e.message) },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold">Коллекции</h1>

      <section className="rounded-sm border p-4 flex flex-col gap-3">
        <h2 className="font-bold">Новая коллекция</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название коллекции"
            className="rounded-sm border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug (авто из названия)"
            className="rounded-sm border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:border-accent"
          />
        </div>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Описание"
          className="rounded-sm border bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-60">Иконка:</span>
          {ICONS.map((ic) => (
            <button
              key={ic}
              onClick={() => setIcon(ic)}
              className={`rounded-sm border px-3 py-1.5 text-xs ${icon === ic ? "border-accent font-semibold" : ""}`}
            >
              {ic}
            </button>
          ))}
        </div>
        <p className="text-xs opacity-60">
          slug: <span className="font-mono">/{preview || "—"}</span>
        </p>
        <details className="rounded-sm border border-dashed p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Поля коллекции{" "}
            <span className="font-normal opacity-60">
              {createFields.length > 0
                ? `— ${createFields.length} шт.`
                : "— необязательно, можно выбрать шаблон"}
            </span>
          </summary>
          <div className="mt-3">
            <SchemaEditor
              value={createFields}
              onChange={setCreateFields}
              idPrefix="create-schema"
              disabled={create.isPending}
            />
          </div>
        </details>
        {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div>
          <button
            onClick={handleCreate}
            disabled={create.isPending}
            className="rounded-sm bg-accent-strong px-4 py-2 text-sm font-semibold text-white hover:bg-accent-deep disabled:opacity-50"
          >
            {create.isPending ? "Создание…" : "Создать"}
          </button>
        </div>
      </section>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-3" aria-label="Загрузка коллекций" role="status">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-sm border p-4 flex flex-col gap-2 animate-pulse" aria-hidden="true">
              <div className="h-5 w-2/3 rounded bg-current opacity-10" />
              <div className="h-3 w-1/3 rounded bg-current opacity-10" />
              <div className="h-3 w-full rounded bg-current opacity-10" />
              <div className="mt-2 flex gap-2">
                <div className="h-7 w-20 rounded-sm bg-current opacity-10" />
                <div className="h-7 w-24 rounded-sm bg-current opacity-10" />
                <div className="h-7 w-20 rounded-sm bg-current opacity-10" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {(data ?? []).map((c) => {
          const fields = parseCollectionSchema(c.schemaJson);
          return (
          <div
            key={c.id}
            data-testid="collection-card"
            data-slug={c.slug}
            className="rounded-sm border p-4 flex flex-col gap-2"
          >
            <Link href={`/collections/${c.slug}`} className="font-bold hover:text-accent">
              <span className="mr-2 inline-block rounded bg-accent/15 px-2 py-0.5 text-xs">{c.icon}</span>
              {c.name}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono opacity-60">/{c.slug}</span>
              <span
                className="rounded-full bg-accent/12 px-2.5 py-0.5 font-bold text-accent-ink dark:text-accent-soft"
                aria-label={`Записей: ${c._count.entries}`}
              >
                {c._count.entries} записей
              </span>
            </div>
            {c.description && editingId !== c.id && <div className="text-sm opacity-80">{c.description}</div>}
            {editingId !== c.id && (
              <div className="flex flex-wrap items-center gap-1 text-[11px]">
                {fields.length > 0 ? (
                  <>
                    <span className="font-semibold opacity-60">Поля:</span>
                    {fields.slice(0, 4).map((field) => (
                      <span key={field.key} className="rounded-full border px-2 py-0.5 opacity-80">
                        {field.label}
                      </span>
                    ))}
                    {fields.length > 4 && (
                      <span className="opacity-60">+{fields.length - 4}</span>
                    )}
                  </>
                ) : (
                  <span className="opacity-60">Без настраиваемых полей</span>
                )}
              </div>
            )}
            {isAdmin && editingId === c.id && (
              <div className="flex flex-col gap-2 rounded-sm border border-dashed p-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Название коллекции"
                  placeholder="Название"
                  className="rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  aria-label="Описание коллекции"
                  placeholder="Описание"
                  className="rounded-sm border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-accent"
                />
                <p className="font-mono text-xs opacity-60">slug: /{c.slug} (не изменяется)</p>
                <details className="rounded-sm border border-dashed p-2">
                  <summary className="cursor-pointer text-xs font-semibold">
                    Поля коллекции ({editFields.length})
                  </summary>
                  <div className="mt-2">
                    <SchemaEditor
                      value={editFields}
                      onChange={setEditFields}
                      idPrefix={`edit-schema-${c.id}`}
                      disabled={update.isPending}
                    />
                  </div>
                </details>
                {editError && <p className="text-xs text-red-700 dark:text-red-400">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(c.id)}
                    disabled={update.isPending}
                    className="rounded-sm bg-accent-strong px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-deep disabled:opacity-50"
                  >
                    {update.isPending ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-sm border px-3 py-1.5 text-xs"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={`/collections/${c.slug}`} className="rounded-sm border px-3 py-1.5 text-xs hover:border-accent">
                Открыть
              </Link>
              {isAdmin && editingId !== c.id && (
                <button
                  onClick={() => startEdit(c)}
                  className="rounded-sm border px-3 py-1.5 text-xs hover:border-accent"
                >
                  Изменить
                </button>
              )}
              <ExportButton collectionId={c.id} />
              <button
                onClick={() => handleDelete(c.id, c.name)}
                disabled={remove.isPending}
                aria-label={`Удалить ${c.name}`}
                className="rounded-sm border border-red-500/50 px-3 py-1.5 text-xs text-red-700 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
            <ImportButton collectionId={c.id} onDone={() => utils.collection.list.invalidate()} />
          </div>
          );
        })}
        {!isLoading && !data?.length && (
          <div className="rounded-sm border border-dashed p-8 text-center">
            <p className="font-bold">Создайте первую коллекцию</p>
            <p className="mt-1 text-sm opacity-60">Заполните форму выше — slug подставится автоматически.</p>
          </div>
        )}
      </div>
    </div>
  );
}

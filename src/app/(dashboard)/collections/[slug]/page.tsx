"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { EntryForm, type EntryFormInitial } from "@/components/entries/EntryForm";
import { ExportButton } from "@/components/collections/CsvButtons";

const STATUSES = ["ALL", "DRAFT", "IN_REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
type StatusFilter = (typeof STATUSES)[number];

export default function CollectionDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const utils = trpc.useUtils();
  const { data: collection } = trpc.collection.get.useQuery({ slug });

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<EntryFormInitial | null>(null);

  const { data: entries, isLoading } = trpc.entry.list.useQuery(
    {
      collectionId: collection?.id ?? "",
      ...(status === "ALL" ? {} : { status }),
      ...(search.trim() !== "" ? { search: search.trim() } : {}),
    },
    { enabled: Boolean(collection?.id) },
  );

  const publish = trpc.entry.publish.useMutation({ onSuccess: refresh });
  const update = trpc.entry.update.useMutation({ onSuccess: refresh });
  const removeEntry = trpc.entry.remove.useMutation({ onSuccess: refresh });

  function refresh() {
    utils.entry.list.invalidate();
    utils.collection.get.invalidate({ slug });
  }

  const filtered = useMemo(() => {
    const needle = tag.trim().toLowerCase();
    if (!needle) return entries ?? [];
    return (entries ?? []).filter((e) =>
      e.tags.some((t) => t.tag.name.toLowerCase().includes(needle)),
    );
  }, [entries, tag]);

  const handleDelete = (id: string, title: string) => {
    if (!window.confirm(`Удалить запись «${title}»?`)) return;
    removeEntry.mutate({ id });
  };

  if (!collection) return <p>Загрузка…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">{collection.name}</h1>
        <span className="text-xs opacity-60">/{collection.slug}</span>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9a3412]"
        >
          Создать запись
        </button>
      </div>

      <div className="sticky top-0 z-10 -mx-1 bg-white/80 px-1 py-2 backdrop-blur dark:bg-neutral-950/80">
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border p-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-status" className="text-xs font-semibold uppercase tracking-wide opacity-60">
              Статус
            </label>
            <select
              id="filter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              className="rounded-lg border bg-transparent px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "ALL" ? "Все статусы" : s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-search" className="text-xs font-semibold uppercase tracking-wide opacity-60">
              Поиск
            </label>
            <input
              id="filter-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по title/slug…"
              className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-tag" className="text-xs font-semibold uppercase tracking-wide opacity-60">
              Тег
            </label>
            <input
              id="filter-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Фильтр по тегу…"
              className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]"
            />
          </div>
          <div className="pb-0.5">
            <ExportButton
              collectionId={collection.id}
              status={status === "ALL" ? undefined : status}
              search={search}
              label="Экспорт CSV (фильтр)"
            />
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm opacity-60">Загрузка записей…</p>}

      <div className="min-w-0 overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase opacity-60">
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Updated</th>
              <th className="px-4 py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-black/5 dark:hover:bg-white/5">
                <td className="px-4 py-2 font-medium">
                  <Link href={`/entries/${e.id}`} className="hover:text-[#f97316] hover:underline">
                    {e.title}
                  </Link>
                </td>
                <td className="px-4 py-2 font-mono text-xs opacity-70">{e.slug}</td>
                <td className="px-4 py-2">
                  <span className="rounded bg-[#f97316]/15 px-2 py-0.5 text-xs">{e.status}</span>
                </td>
                <td className="px-4 py-2 text-xs opacity-70">
                  {new Date(e.updatedAt).toLocaleString("ru-RU")}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    <Link
                      href={`/entries/${e.id}`}
                      className="rounded-lg border px-2 py-1 text-xs hover:border-[#f97316]"
                    >
                      Builder
                    </Link>
                    <button
                      onClick={() =>
                        setEditing({
                          id: e.id,
                          title: e.title,
                          slug: e.slug,
                          collectionId: collection.id,
                          excerpt: e.excerpt,
                          fieldsJson: e.fieldsJson,
                          tags: e.tags.map((t) => t.tag.name),
                          scheduledFor: e.scheduledFor,
                          seoTitle: e.seoTitle,
                          seoDescription: e.seoDescription,
                        })
                      }
                      className="rounded-lg border px-2 py-1 text-xs hover:border-[#f97316]"
                    >
                      Ред.
                    </button>
                    {e.status !== "PUBLISHED" ? (
                      <button
                        onClick={() => publish.mutate({ id: e.id })}
                        aria-label={`Опубликовать ${e.title}`}
                        className="rounded-lg border px-2 py-1 text-xs hover:border-green-500"
                      >
                        Публиковать
                      </button>
                    ) : (
                      <button
                        onClick={() => update.mutate({ id: e.id, status: "ARCHIVED" })}
                        aria-label={`Архивировать ${e.title}`}
                        className="rounded-lg border px-2 py-1 text-xs hover:border-yellow-500"
                      >
                        Архив
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(e.id, e.title)}
                      className="rounded-lg border border-red-500/50 px-2 py-1 text-xs text-red-600 dark:text-red-500 hover:bg-red-500/10"
                    >
                      Удалить
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && !filtered.length && (
          <div className="p-6 text-center">
            <p className="font-bold">Ничего не найдено</p>
            <p className="mt-1 text-sm opacity-60">Попробуйте изменить фильтры или сбросьте их.</p>
            <button
              type="button"
              onClick={() => {
                setStatus("ALL");
                setSearch("");
                setTag("");
              }}
              className="mt-3 rounded-lg border border-[#f97316] px-4 py-1.5 text-sm font-semibold text-[#9a3412] dark:text-[#f97316]"
            >
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setShowCreate(false)}>
          <div className="mt-10 w-full max-w-2xl rounded-2xl border bg-white p-5 shadow-xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-bold">Новая запись</h2>
            <EntryForm
              collectionId={collection.id}
              onSaved={() => {
                setShowCreate(false);
                refresh();
              }}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="mt-10 w-full max-w-2xl rounded-2xl border bg-white p-5 shadow-xl dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-lg font-bold">Редактировать запись</h2>
            <EntryForm
              initial={editing}
              onSaved={() => {
                setEditing(null);
                refresh();
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

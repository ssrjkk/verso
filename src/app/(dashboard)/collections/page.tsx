"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { useSession } from "@/lib/auth-client";
import { slugify } from "@/lib/slug";
import { ExportButton, ImportButton } from "@/components/collections/CsvButtons";

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
  const [error, setError] = useState<string | null>(null);

  // Inline-редактирование карточки: name + description. Slug — только текст:
  // это часть URL Headless API, его смена ломает интеграции.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const preview = useMemo(() => slugify(slug.trim() !== "" ? slug : name), [slug, name]);

  const handleCreate = () => {
    setError(null);
    if (!name.trim()) {
      setError("Название обязательно");
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        ...(slug.trim() !== "" ? { slug: slugify(slug) } : {}),
        ...(desc.trim() !== "" ? { description: desc.trim() } : {}),
        icon,
      },
      { onError: (e) => setError(e.message) },
    );
  };

  const handleDelete = (id: string, collectionName: string) => {
    if (!window.confirm(`Удалить коллекцию «${collectionName}» вместе со всеми записями?`)) return;
    remove.mutate({ id });
  };

  const startEdit = (c: { id: string; name: string; description: string | null }) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditDesc(c.description ?? "");
    setEditError(null);
  };

  const handleSaveEdit = (id: string) => {
    setEditError(null);
    if (!editName.trim()) {
      setEditError("Название обязательно");
      return;
    }
    update.mutate(
      { id, name: editName.trim(), description: editDesc.trim() },
      { onError: (e) => setEditError(e.message) },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold">Коллекции</h1>

      <section className="rounded-2xl border p-4 flex flex-col gap-3">
        <h2 className="font-bold">Новая коллекция</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название коллекции"
            className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="slug (авто из названия)"
            className="rounded-lg border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:border-[#f97316]"
          />
        </div>
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Описание"
          className="rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-[#f97316]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-60">Иконка:</span>
          {ICONS.map((ic) => (
            <button
              key={ic}
              onClick={() => setIcon(ic)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${icon === ic ? "border-[#f97316] font-semibold" : ""}`}
            >
              {ic}
            </button>
          ))}
        </div>
        <p className="text-xs opacity-60">
          slug: <span className="font-mono">/{preview || "—"}</span>
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-500">{error}</p>}
        <div>
          <button
            onClick={handleCreate}
            disabled={create.isPending}
            className="rounded-lg bg-[#c2410c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9a3412] disabled:opacity-50"
          >
            {create.isPending ? "Создание…" : "Создать"}
          </button>
        </div>
      </section>

      {isLoading && (
        <div className="grid sm:grid-cols-2 gap-3" aria-label="Загрузка коллекций" role="status">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl border p-4 flex flex-col gap-2 animate-pulse" aria-hidden="true">
              <div className="h-5 w-2/3 rounded bg-current opacity-10" />
              <div className="h-3 w-1/3 rounded bg-current opacity-10" />
              <div className="h-3 w-full rounded bg-current opacity-10" />
              <div className="mt-2 flex gap-2">
                <div className="h-7 w-20 rounded-lg bg-current opacity-10" />
                <div className="h-7 w-24 rounded-lg bg-current opacity-10" />
                <div className="h-7 w-20 rounded-lg bg-current opacity-10" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {(data ?? []).map((c) => (
          <div key={c.id} className="rounded-2xl border p-4 flex flex-col gap-2">
            <Link href={`/collections/${c.slug}`} className="font-bold hover:text-[#f97316]">
              <span className="mr-2 inline-block rounded bg-[#f97316]/15 px-2 py-0.5 text-xs">{c.icon}</span>
              {c.name}
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono opacity-60">/{c.slug}</span>
              <span
                className="rounded-full bg-[#f97316]/12 px-2.5 py-0.5 font-bold text-[#9a3412] dark:text-[#f97316]"
                aria-label={`Записей: ${c._count.entries}`}
              >
                {c._count.entries} записей
              </span>
            </div>
            {c.description && editingId !== c.id && <div className="text-sm opacity-80">{c.description}</div>}
            {isAdmin && editingId === c.id && (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed p-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Название коллекции"
                  placeholder="Название"
                  className="rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]"
                />
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  aria-label="Описание коллекции"
                  placeholder="Описание"
                  className="rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]"
                />
                <p className="font-mono text-xs opacity-60">slug: /{c.slug} (не изменяется)</p>
                {editError && <p className="text-xs text-red-600 dark:text-red-500">{editError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveEdit(c.id)}
                    disabled={update.isPending}
                    className="rounded-lg bg-[#c2410c] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9a3412] disabled:opacity-50"
                  >
                    {update.isPending ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg border px-3 py-1.5 text-xs"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link href={`/collections/${c.slug}`} className="rounded-lg border px-3 py-1.5 text-xs hover:border-[#f97316]">
                Открыть
              </Link>
              {isAdmin && editingId !== c.id && (
                <button
                  onClick={() => startEdit(c)}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:border-[#f97316]"
                >
                  Изменить
                </button>
              )}
              <ExportButton collectionId={c.id} />
              <button
                onClick={() => handleDelete(c.id, c.name)}
                disabled={remove.isPending}
                aria-label={`Удалить ${c.name}`}
                className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-600 dark:text-red-500 hover:bg-red-500/10 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
            <ImportButton collectionId={c.id} onDone={() => utils.collection.list.invalidate()} />
          </div>
        ))}
        {!isLoading && !data?.length && (
          <div className="rounded-2xl border border-dashed p-8 text-center">
            <p className="font-bold">Создайте первую коллекцию</p>
            <p className="mt-1 text-sm opacity-60">Заполните форму выше — slug подставится автоматически.</p>
          </div>
        )}
      </div>
    </div>
  );
}

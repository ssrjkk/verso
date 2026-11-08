"use client";
import { trpc } from "@/trpc/client";
import { useMemo, useRef, useState } from "react";

const FOLDERS = ["all", "root", "blog", "products", "og"];
const TYPES = ["all", "image", "pdf", "video"] as const;

function kindOf(mime: string): "image" | "pdf" | "video" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "other";
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / 1024 / 1024).toFixed(2)} МБ`;
}

export default function MediaPage() {
  const utils = trpc.useUtils();
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [uploadFolder, setUploadFolder] = useState("root");
  const [altText, setAltText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isPending } = trpc.media.list.useQuery({ folder: folder === "all" ? undefined : folder, search: q || undefined });
  const { data: stats } = trpc.media.stats.useQuery();
  const updateAlt = trpc.media.updateAlt.useMutation({ onSuccess: () => utils.media.list.invalidate() });
  const remove = trpc.media.remove.useMutation({ onSuccess: () => { utils.media.list.invalidate(); utils.media.stats.invalidate(); } });

  const items = useMemo(() => {
    const all = data ?? [];
    if (type === "all") return all;
    return all.filter((m) => kindOf(m.mimeType) === type);
  }, [data, type]);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const form = new FormData();
        form.append("file", f);
        form.append("folder", uploadFolder);
        form.append("altText", altText);
        const res = await fetch("/api/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Ошибка загрузки");
      }
      await Promise.all([utils.media.list.invalidate(), utils.media.stats.invalidate()]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-extrabold">Медиатека</h1>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf,video/*" onChange={(e) => handleFiles(e.target.files)} className="text-sm" aria-label="Загрузить файлы в медиатеку" />
        <select value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} className="rounded-lg border bg-transparent px-2 py-1 text-sm" aria-label="Папка загрузки">
          {FOLDERS.filter((f) => f !== "all").map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Alt-текст для загрузки</span>
          <input value={altText} onChange={(e) => setAltText(e.target.value)} placeholder="alt-текст…" aria-label="Alt-текст для загрузки" className="rounded-lg border bg-transparent px-3 py-1 text-sm" />
        </label>
        <span className="opacity-60">{uploading ? "Загрузка…" : "max 10MB · image/pdf/video"}</span>
      </div>
      {error && <div className="rounded-xl border border-red-500 p-2 text-sm text-red-600 dark:text-red-500">{error}</div>}

      <div className="flex flex-wrap gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" className="max-w-xs rounded-lg border bg-transparent px-3 py-1 text-sm" />
        <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Фильтр папки" className="rounded-lg border bg-transparent px-2 py-1">
          {FOLDERS.map((f) => <option key={f} value={f}>{f === "all" ? "Все папки" : f}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Фильтр типа файла" className="rounded-lg border bg-transparent px-2 py-1">
          {TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "Все типы" : t}</option>)}
        </select>
      </div>

      {stats && (
        <div className="text-sm opacity-70">
          Всего файлов: <b>{stats.total}</b> · Вес: <b>{fmtBytes(stats.totalBytes)}</b> · image {stats.image} · pdf {stats.pdf} · video {stats.video}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {isPending
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton animate-pulse rounded-2xl border p-3">
                <div className="mb-2 h-32 w-full rounded-xl bg-black/10 dark:bg-white/10" />
                <div className="h-4 w-3/4 rounded bg-black/10 dark:bg-white/10" />
                <div className="mt-2 h-3 w-1/2 rounded bg-black/10 dark:bg-white/10" />
              </div>
            ))
          : items.map((m) => (
          <div key={m.id} className="rounded-2xl border p-3 text-sm">
            {m.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.altText || m.filename} className="mb-2 h-32 w-full rounded-xl object-cover" loading="lazy" />
            ) : (
              <div className="mb-2 flex h-32 items-center justify-center rounded-xl bg-black/5 text-xs opacity-60">
                {m.mimeType.startsWith("video/") ? "Видео" : m.mimeType === "application/pdf" ? "PDF" : m.mimeType}
              </div>
            )}
            <div className="truncate font-semibold" title={m.filename}>{m.filename}</div>
            <div className="text-xs opacity-60">{m.folder} · {fmtBytes(m.sizeBytes)}</div>
            <label className="mt-2 block">
              <span className="sr-only">Alt-текст для {m.filename}</span>
              <input
                defaultValue={m.altText}
                key={m.id + m.altText}
                placeholder="alt-текст…"
                aria-label={`Alt-текст для ${m.filename}`}
                onBlur={(e) => e.target.value !== m.altText && updateAlt.mutate({ id: m.id, altText: e.target.value })}
                className="w-full rounded border bg-transparent px-2 py-1 text-xs"
              />
            </label>
            <button
              onClick={() => { if (confirm(`Удалить ${m.filename}?`)) remove.mutate({ id: m.id }); }}
              className="mt-2 text-xs text-red-600 dark:text-red-500"
            >
              Удалить
            </button>
          </div>
        ))}
      </div>
      {!isPending && !items.length && <p className="text-sm opacity-60">Ничего не найдено</p>}
    </div>
  );
}

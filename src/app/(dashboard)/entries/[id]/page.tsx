"use client";

import { use, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/trpc/client";
import BlockRender from "@/components/blocks/BlockRender";
import BlockEditor from "@/components/blocks/BlockEditor";
import OgPreview from "@/components/seo/OgPreview";
import { isValidSlug } from "@/lib/slug";
import {
  BLOCK_TYPES,
  BLOCK_TYPE_LABELS,
  DEFAULT_BLOCKS,
  defaultPropsJson,
  parseProps,
  type BlockType,
} from "@/components/blocks/block-defaults";

type LocalBlock = {
  cid: string;
  id?: string;
  type: BlockType;
  order: number;
  isVisible: boolean;
  propsJson: string;
};

type BlockTypeInput = "HERO" | "FEATURES" | "PRICING" | "FAQ" | "RICH_TEXT" | "GALLERY" | "CODE" | "CTA";

let cidCounter = 0;
function nextCid(): string {
  cidCounter += 1;
  return `local-${Date.now()}-${cidCounter}`;
}

function safeObject(propsJson: string, type: BlockType): Record<string, unknown> {
  return parseProps<Record<string, unknown>>(propsJson, { ...(DEFAULT_BLOCKS[type] as object) } as Record<string, unknown>);
}

function SortableBlockRow({
  block,
  index,
  expanded,
  onToggleExpand,
  onToggleVisible,
  onRemove,
  onPropsChange,
}: {
  block: LocalBlock;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleVisible: () => void;
  onRemove: () => void;
  onPropsChange: (next: Record<string, unknown>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.cid });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="rounded-2xl border bg-white/60 dark:bg-white/5">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          title="Перетащить"
          aria-label="Перетащить блок"
          className="cursor-grab rounded-lg border px-2 py-1 text-xs opacity-70 hover:opacity-100 active:cursor-grabbing"
        >
          ⋮⋮
        </button>
        <span className="rounded-full bg-[#f97316]/12 px-2.5 py-0.5 text-xs font-bold text-[#9a3412] dark:text-[#f97316]">
          {BLOCK_TYPE_LABELS[block.type]} · #{index + 1}
        </span>
        {!block.isVisible ? (
          <span className="rounded-full border px-2 py-0.5 text-xs opacity-60">скрыт</span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleVisible}
            title={block.isVisible ? "Скрыть" : "Показать"}
            className="rounded-lg border px-2 py-1 text-xs hover:border-[#f97316]"
          >
            {block.isVisible ? "👁" : "🚫"}
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-lg border px-2.5 py-1 text-xs font-semibold hover:border-[#f97316]"
          >
            {expanded ? "Свернуть" : "Редактировать"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Удалить блок"
            className="rounded-lg border px-2 py-1 text-xs text-red-600 dark:text-red-500 hover:border-red-500"
          >
            ✕
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="border-t p-3">
          <BlockEditor type={block.type} value={safeObject(block.propsJson, block.type)} onChange={onPropsChange} />
        </div>
      ) : null}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  IN_REVIEW: "На ревью",
  SCHEDULED: "Запланирована",
  PUBLISHED: "Опубликована",
  ARCHIVED: "В архиве",
};

export default function EntryBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const utils = trpc.useUtils();

  const entryQuery = trpc.entry.get.useQuery({ id });
  const blocksQuery = trpc.block.list.useQuery({ entryId: id });

  const [blocks, setBlocks] = useState<LocalBlock[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saveNote, setSaveNote] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  // SEO-форма
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [seoHydrated, setSeoHydrated] = useState(false);

  const slugValid = slug.trim() === "" || isValidSlug(slug.trim());

  function relativeTime(iso: string | Date): string {
    const d = new Date(iso).getTime();
    if (Number.isNaN(d)) return "";
    const diffSec = Math.round((d - Date.now()) / 1000);
    const abs = Math.abs(diffSec);
    const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });
    if (abs < 60) return rtf.format(diffSec, "second");
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
    if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
    if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
    return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!hydrated && blocksQuery.data) {
      setBlocks(
        blocksQuery.data.map((b) => ({
          cid: b.id,
          id: b.id,
          type: (BLOCK_TYPES as readonly string[]).includes(b.type) ? (b.type as BlockType) : "RICH_TEXT",
          order: b.order,
          isVisible: b.isVisible,
          propsJson: b.propsJson,
        })),
      );
      setHydrated(true);
    }
  }, [blocksQuery.data, hydrated]);

  useEffect(() => {
    const e = entryQuery.data;
    if (!seoHydrated && e) {
      setTitle(e.title ?? "");
      setSlug(e.slug ?? "");
      setExcerpt(e.excerpt ?? "");
      setSeoTitle(e.seoTitle ?? "");
      setSeoDescription(e.seoDescription ?? "");
      setOgImage((e as { ogImageUrl?: string | null }).ogImageUrl ?? "");
      setScheduledFor(e.scheduledFor ? new Date(e.scheduledFor).toISOString().slice(0, 16) : "");
      setStatus(e.status ?? "DRAFT");
      setSeoHydrated(true);
    }
  }, [entryQuery.data, seoHydrated]);

  const saveBlocks = trpc.block.upsertMany.useMutation({
    onSuccess: async () => {
      setFeedback("Блоки сохранены");
      await utils.block.list.invalidate({ entryId: id });
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка сохранения: ${err.message}`),
  });
  const updateEntry = trpc.entry.update.useMutation({
    onSuccess: async () => {
      setFeedback("Запись обновлена");
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка обновления: ${err.message}`),
  });
  const publishEntry = trpc.entry.publish.useMutation({
    onSuccess: async () => {
      setFeedback("Запись опубликована");
      await utils.entry.get.invalidate({ id });
    },
    onError: (err) => setFeedback(`Ошибка публикации: ${err.message}`),
  });
  const restoreRevision = trpc.entry.restoreRevision.useMutation({
    onSuccess: async () => {
      setFeedback("Откат выполнен");
      setHydrated(false);
      setSeoHydrated(false);
      await utils.entry.get.invalidate({ id });
      await utils.block.list.invalidate({ entryId: id });
    },
    onError: (err) => setFeedback(`Ошибка отката: ${err.message}`),
  });

  const sortableIds = useMemo(() => blocks.map((b) => b.cid), [blocks]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.cid === active.id);
      const newIndex = prev.findIndex((b) => b.cid === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex).map((b, i) => ({ ...b, order: i }));
    });
  }

  function addBlock(type: BlockType) {
    setBlocks((prev) => [
      ...prev,
      { cid: nextCid(), type, order: prev.length, isVisible: true, propsJson: defaultPropsJson(type) },
    ]);
  }

  function handleSave() {
    setFeedback(null);
    saveBlocks.mutate({
      entryId: id,
      blocks: blocks.map((b, i) => ({
        id: b.id,
        type: b.type as BlockTypeInput,
        order: i,
        isVisible: b.isVisible,
        propsJson: b.propsJson,
      })),
    });
  }

  function handleSeoSave() {
    setFeedback(null);
    updateEntry.mutate({
      id,
      title: title || undefined,
      slug: slug || undefined,
      excerpt: excerpt || undefined,
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
      scheduledFor: scheduledFor || undefined,
      status: status as "DRAFT" | "IN_REVIEW" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED",
      changeNote: saveNote || "Обновление SEO и метаданных",
      // Оптимистичная блокировка: сервер отклонит сохранение чужой версии кодом CONFLICT.
        // Оптимистичная блокировка: сервер отклонит сохранение чужой версии кодом CONFLICT.
        expectedUpdatedAt: entry?.updatedAt
          ? entry.updatedAt instanceof Date
            ? entry.updatedAt.toISOString()
            : String(entry.updatedAt)
          : undefined,
    });
  }

  if (entryQuery.isPending || blocksQuery.isPending) {
    return <div className="p-6 text-sm opacity-70">Загрузка конструктора…</div>;
  }
  if (entryQuery.isError) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-500">Не удалось загрузить запись: {entryQuery.error.message}</div>;
  }
  if (blocksQuery.isError) {
    return <div className="p-6 text-sm text-red-600 dark:text-red-500">Не удалось загрузить блоки: {blocksQuery.error.message}</div>;
  }
  const entry = entryQuery.data;
  if (!entry) return <div className="p-6 text-sm opacity-70">Запись не найдена</div>;

  const revisions = entry.revisions ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold">Конструктор: {entry.title}</h1>
        <span className="rounded-full bg-[#f97316]/12 px-3 py-1 text-xs font-bold text-[#9a3412] dark:text-[#f97316]">
          {STATUS_LABELS[entry.status] ?? entry.status}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-xl border px-4 py-2 text-sm font-semibold hover:border-[#f97316]"
          >
            🖨 Печать
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saveBlocks.isPending}
            className="rounded-xl bg-[#c2410c] px-5 py-2 text-sm font-bold text-white hover:bg-[#9a3412] disabled:opacity-50"
          >
            {saveBlocks.isPending ? "Сохранение…" : "Сохранить блоки"}
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="no-print rounded-xl border border-[#f97316]/40 bg-[#f97316]/8 px-4 py-2 text-sm">{feedback}</div>
      ) : null}

      {/* Добавить блоки */}
      <section className="no-print rounded-2xl border p-4">
        <div className="mb-2 text-sm font-bold">Добавить блок</div>
        <div className="flex flex-wrap gap-2">
          {BLOCK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addBlock(t)}
              className="rounded-lg border px-3 py-1.5 text-xs font-semibold hover:border-[#f97316] hover:text-[#f97316]"
            >
              + {BLOCK_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {/* Список блоков с dnd-kit */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <div className="no-print flex flex-col gap-2">
            {blocks.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm opacity-60">
                Блоков пока нет — добавьте первый блок выше
              </div>
            ) : null}
            {blocks.map((b, i) => (
              <SortableBlockRow
                key={b.cid}
                block={b}
                index={i}
                expanded={!!expanded[b.cid]}
                onToggleExpand={() => setExpanded((prev) => ({ ...prev, [b.cid]: !prev[b.cid] }))}
                onToggleVisible={() =>
                  setBlocks((prev) => prev.map((x) => (x.cid === b.cid ? { ...x, isVisible: !x.isVisible } : x)))
                }
                onRemove={() => setBlocks((prev) => prev.filter((x) => x.cid !== b.cid).map((x, idx) => ({ ...x, order: idx })))}
                onPropsChange={(next) =>
                  setBlocks((prev) =>
                    prev.map((x) => (x.cid === b.cid ? { ...x, propsJson: JSON.stringify(next, null, 2) } : x)),
                  )
                }
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Превью */}
      <section className="print-clean rounded-2xl border p-5">
        <h2 className="font-display mb-3 text-xl font-bold">Превью</h2>
        <div className="flex flex-col gap-4">
          {blocks.filter((b) => b.isVisible).length === 0 ? (
            <div className="text-sm opacity-60">Нет видимых блоков для превью</div>
          ) : null}
          {blocks
            .filter((b) => b.isVisible)
            .map((b) => (
              <BlockRender key={b.cid} type={b.type} propsJson={b.propsJson} />
            ))}
        </div>
      </section>

      {/* SEO-панель */}
      <section className="no-print rounded-2xl border p-4">
        <h2 className="font-display mb-3 text-lg font-bold">SEO и публикация</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block" htmlFor="seo-title">
            <span className="mb-1 block text-xs font-semibold opacity-70">Заголовок</span>
            <input id="seo-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
          </label>
          <div className="block">
            <label htmlFor="seo-slug" className="mb-1 block text-xs font-semibold opacity-70">Slug</label>
            <input
              id="seo-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-invalid={!slugValid}
              aria-describedby="seo-slug-hint"
              className={`w-full rounded-lg border bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-[#f97316] ${!slugValid ? "border-red-500" : ""}`}
            />
            <p id="seo-slug-hint" className="mt-1 text-xs opacity-60">
              Только латиница, цифры и дефисы (a-z, 0-9, -).
              {!slugValid && <span role="alert" className="font-semibold text-red-600 dark:text-red-500"> Некорректный slug.</span>}
            </p>
          </div>
          <label className="block sm:col-span-2" htmlFor="seo-excerpt">
            <span className="mb-1 block text-xs font-semibold opacity-70">Анонс (excerpt)</span>
            <textarea id="seo-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
          </label>
          <div className="block">
            <label htmlFor="seo-meta-title" className="mb-1 block text-xs font-semibold opacity-70">SEO-заголовок</label>
            <input id="seo-meta-title" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={120} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
            <p className="mt-1 text-xs opacity-60" aria-live="polite">{seoTitle.length}/60 — оптимально до 60 символов</p>
          </div>
          <div className="block">
            <label htmlFor="seo-meta-desc" className="mb-1 block text-xs font-semibold opacity-70">SEO-описание</label>
            <input id="seo-meta-desc" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={320} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
            <p className="mt-1 text-xs opacity-60" aria-live="polite">{seoDescription.length}/160 — оптимально до 160 символов</p>
          </div>
          <div className="block sm:col-span-2">
            <label htmlFor="seo-og-image" className="mb-1 block text-xs font-semibold opacity-70">OG-изображение (URL)</label>
            <input
              id="seo-og-image"
              value={ogImage}
              onChange={(e) => setOgImage(e.target.value)}
              placeholder="https://…/og.png"
              className="w-full rounded-lg border bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus:border-[#f97316]"
            />
            <p className="mt-1 text-xs opacity-60">Используется только для предпросмотра ниже.</p>
          </div>
          <label className="block" htmlFor="seo-scheduled">
            <span className="mb-1 block text-xs font-semibold opacity-70">Запланировать на</span>
            <input id="seo-scheduled" type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
          </label>
          <label className="block" htmlFor="seo-status">
            <span className="mb-1 block text-xs font-semibold opacity-70">Статус</span>
            <select id="seo-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]">
              {Object.entries(STATUS_LABELS).map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2" htmlFor="seo-note">
            <span className="mb-1 block text-xs font-semibold opacity-70">Комментарий к изменению</span>
            <input id="seo-note" value={saveNote} onChange={(e) => setSaveNote(e.target.value)} placeholder="Например: обновил hero и тарифы" className="w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-[#f97316]" />
          </label>
        </div>
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold">Предпросмотр в соцсетях</h3>
          <OgPreview
            title={seoTitle || title}
            description={seoDescription || excerpt}
            image={ogImage || undefined}
            url={`/${entry.collection?.slug ?? "entry"}/${slug || entry.slug}`}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSeoSave}
            disabled={updateEntry.isPending || !slugValid}
            aria-busy={updateEntry.isPending}
            className="rounded-xl border border-[#f97316] px-5 py-2 text-sm font-bold text-[#9a3412] hover:bg-[#f97316]/10 disabled:opacity-50 dark:text-[#f97316]"
          >
            {updateEntry.isPending ? "Сохранение…" : "Сохранить SEO"}
          </button>
          <button
            type="button"
            onClick={() => publishEntry.mutate({ id })}
            disabled={publishEntry.isPending}
            aria-busy={publishEntry.isPending}
            className="rounded-xl bg-[#c2410c] px-5 py-2 text-sm font-bold text-white hover:bg-[#9a3412] disabled:opacity-50"
          >
            {publishEntry.isPending ? "Публикация…" : "Опубликовать"}
          </button>
        </div>
      </section>

      {/* Ревизии */}
      <section className="no-print rounded-2xl border p-4">
        <h2 className="font-display mb-3 text-lg font-bold">История ревизий ({revisions.length})</h2>
        {revisions.length === 0 ? (
          <div className="text-sm opacity-60">Ревизий пока нет</div>
        ) : (
          <div className="flex flex-col gap-2">
            {revisions.map((r, idx) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                <span className="rounded-full bg-[#f97316]/12 px-2 py-0.5 text-xs font-bold text-[#9a3412] dark:text-[#f97316]">v{r.version}</span>
                <span className="opacity-80">{r.changeNote ?? "Без комментария"}</span>
                <span className="text-xs opacity-50" title={new Date(r.createdAt).toLocaleString("ru-RU")}>
                  {new Date(r.createdAt).toLocaleString("ru-RU")} · {relativeTime(r.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => restoreRevision.mutate({ entryId: id, revisionId: r.id })}
                  disabled={restoreRevision.isPending || idx === 0}
                  title={idx === 0 ? "Текущая версия" : `Откатить к v${r.version}`}
                  aria-label={idx === 0 ? `Текущая версия v${r.version}` : `Откатить к версии ${r.version}`}
                  className="ml-auto rounded-lg border px-3 py-1 text-xs font-semibold hover:border-[#f97316] disabled:opacity-50"
                >
                  {idx === 0 ? "Текущая" : "Откатить"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
